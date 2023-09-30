import {
    composeDown,
    composeUp,
    copy,
    dirname,
    ensureDirectory,
    exists,
    expand,
    handlebars,
    hostWriter,
    IComposeDownArgs,
    IComposeUpArgs,
    join,
    parseYaml,
    readTextFile,
    registerHandlebarsDefaults,
    SecretGenerator,
    secretMasker,
    set,
    sops,
    which,
    writeTextFile,
} from "../deps.ts";
import { ValueBuilder } from "../_value_builder.ts";
import { IPackageExecutionContext, ISecretsSection } from "../interfaces.ts";
import { savePackageCache } from "../config/mod.ts";

async function generateEnvFile(ctx: IPackageExecutionContext, vb: ValueBuilder, secretsFile?: string) {
    secretsFile ??= ctx.package.secretsFile;

    console.log("secretsFile", secretsFile);
    if (!await exists(secretsFile)) {
        console.log("no secrets file");
        return;
    }

    const service = ctx.package.spec.service ?? ctx.package.spec.name;
    const composeDir = join(ctx.config.paths.data, "etc", "compose", service);
    const envFile = join(composeDir, ".env");

    const content = await readTextFile(secretsFile);
    console.log(content);
    const sections = parseYaml(content) as ISecretsSection[];
    console.log(sections);
    let envText = "";
    const env: Record<string, string | undefined> = {};
    for (let i = 0; i < sections.length; i++) {
        const s = sections[i];
        console.log(s);
        if (!s.path || s.path.length === 0) {
            ctx.host.warn(`Secrets section ${i} has no path`);
            continue;
        }
        let secret = await ctx.secretStore.get(s.path);
        if (secret === undefined || secret === null || secret === "") {
            if (s.default) {
                secret = s.default;
                await ctx.secretStore.set(s.path, secret);
            } else {
                if (!s.create) {
                    ctx.host.warn(`Secret ${s.path} has no value`);
                    continue;
                }
    
                const sg = new SecretGenerator();
                sg.addDefaults();
                secret = sg.generate(s.length ?? 16);
                await ctx.secretStore.set(s.path, secret);
            }          
        }

        secretMasker.add(secret);
        env[s.name] = secret;
        if (secret.includes('"')) {
            envText += `${s.name}='${secret}'\n`;
        } else {
            envText += `${s.name}="${secret}"\n`;
        }
    }

    vb.add({ secrets: env });
    await ensureDirectory(composeDir);

    await writeTextFile(envFile, envText);
    if (ctx.config.sops.enabled && ctx.config.sops.recipient) {
        set("SOPS_AGE_RECIPIENTS", ctx.config.sops.recipient!);
        await sops(["-e", "-i", envFile]);
    }
}

async function walk(src: string, dest: string, hb: typeof handlebars, locals: Record<string, unknown>) {
    for await (const entry of Deno.readDir(src)) {
        const path = join(src, entry.name);
        if (entry.isDirectory) {
            await walk(path, join(dest, entry.name), hb, locals);
        } else {
            await ensureDirectory(dest);

            let destPath = join(dest, entry.name);
            if (path.endsWith(".hbs")) {
                destPath = destPath.substring(0, destPath.length - 4);
                if (await exists(destPath)) {
                    continue;
                }

                const tplContent = await readTextFile(path);
                const tpl = hb.compile(tplContent);
                const content = tpl(locals);

                await writeTextFile(destPath, content);
                continue;
            }

            if (await exists(destPath)) {
                continue;
            }

            await copy(path, destPath, { overwrite: true });
        }
    }
}

export async function unpack(ctx: IPackageExecutionContext, valueFiles?: string[], secretsFile?: string, inspect= false) {
    const vb = new ValueBuilder();
    vb.addDefaults(ctx);
    await vb.addYamlFile(ctx.package.valuesFile);
    if (valueFiles) {
        await vb.addYamlFile(valueFiles);
    }

    secretsFile ??= ctx.package.secretsFile;
    const locals = vb.build();
    if (inspect)
    {
        ctx.host.info("Values:");
        ctx.host.writeLine(JSON.stringify(locals, null, 4));
        ctx.host.writeLine();
    }
       
    const composeFile = ctx.package.composeFile;
    const service = (locals.service ?? locals.name) as string | undefined;
    if (!service) {
        throw new Error("No service name specified. Ensure that the values file contains a service or name property");
    }
    const composeDir = join(ctx.config.paths.data, "etc", "compose", service);

    await ensureDirectory(composeDir);

    await generateEnvFile(ctx, vb, secretsFile);

    const hbs = handlebars.create();
    registerHandlebarsDefaults(hbs);
    const template = await readTextFile(composeFile);
    const dir = dirname(composeFile);
    const content = hbs.compile(template)(locals);
    const outFile = join(composeDir, "compose.yaml");
    const packageDir = dirname(ctx.package.file);
    
    let cacheEntry = ctx.cache.entries.find((e) => e.name === service);
    if (!cacheEntry) {
        cacheEntry = {
            packageDir: packageDir,
            composeDir: dir,
            name: service,
            version: ctx.package.spec.version,
            valuesFiles: [ctx.package.valuesFile, ...valueFiles ?? []],
            secretsFile: secretsFile,
        };
        ctx.cache.entries.push(cacheEntry);
    } else {
        cacheEntry.packageDir = packageDir;
        cacheEntry.composeDir = dir;
        cacheEntry.version = ctx.package.spec.version;
        cacheEntry.valuesFiles = [ctx.package.valuesFile, ...valueFiles ?? []];
        cacheEntry.secretsFile = secretsFile;
    }

    await savePackageCache(ctx.cache);

    const dockerFile = join(dir, "Dockerfile");
    if (await exists(dockerFile)) {
        await copy(dockerFile, join(composeFile, "Dockerfile"), { overwrite: true });
    }

    if (inspect)
    {
        ctx.host.info("compose.yaml:");
        ctx.host.writeLine(content);
        ctx.host.writeLine();
    }
        

    await writeTextFile(outFile, content);

    if (locals.volumes) {
        const volumes = locals.volumes as Record<string, unknown>;
        for (const key in volumes) {
            let value = volumes[key] as string;
            value = expand(value);
            volumes[key] = value;

            if (!value || value.length === 0) {
                continue;
            }

            const childDir = join(dir, key);
            if (await exists(childDir)) {
                await walk(childDir, value, handlebars, locals);
            }
        }
    }
}

export async function up(ctx: IPackageExecutionContext) {
    const service = ctx.package.spec.service ?? ctx.package.spec.name;
    const composeDir = join(ctx.config.paths.data, "etc", "compose", service);
    const composeFile = join(composeDir, "compose.yaml");
    const envFile = join(composeDir, ".env");

    const args: IComposeUpArgs = {
        projectDirectory: composeDir,
        file: [composeFile],
        wait: true,
    };

    let useSops = ctx.config.sops.enabled &&
        ctx.config.sops.recipient !== undefined &&
        await which("sops") !== undefined;

        console.log("env", envFile);
        hostWriter.debug(`useSops: ${useSops}. enabled: ${ctx.config.sops.enabled}, recipient: ${ctx.config.sops.recipient}`);
    if (await exists(envFile)) {
        console.log()
        args.envFile = [envFile];

        if (useSops) {
            set("SOPS_AGE_RECIPIENTS", ctx.config.sops.recipient!);
            await sops(["-d", "-i", envFile]);
        }
    } else {
        useSops = false;
    }

    try {
        await composeUp(args);
    } finally {
        if (useSops) {
            await sops(["-e", "-i", envFile]);
        }
    }
}

export async function down(ctx: IPackageExecutionContext) {
    const service = ctx.package.spec.service ?? ctx.package.spec.name;
    const composeDir = join(ctx.config.paths.data, "etc", "compose", service);
    const composeFile = join(composeDir, "compose.yaml");
    const envFile = join(composeDir, ".env");

    const args: IComposeDownArgs = {
        projectDirectory: composeDir,
        file: [composeFile],
        timeout: 60,
    };

    let useSops = ctx.config.sops.enabled &&
        ctx.config.sops.recipient !== undefined &&
        await which("sops") !== undefined;

        hostWriter.debug(`useSops: ${useSops}. enabled: ${ctx.config.sops.enabled}, recipient: ${ctx.config.sops.recipient}`);
    if (await exists(envFile)) {
        args.envFile = [envFile];

        if (useSops) {
            set("SOPS_AGE_RECIPIENTS", ctx.config.sops.recipient!);
            await sops(["-d", "-i", envFile]);
        }
    } else {
        useSops = false;
    }

    try {
        await composeDown(args);
    } finally {
        if (useSops) {
            await sops(["-e", "-i", envFile]);
        }
    }
}
