import {
    composeDown,
    composeUp,
    copy,
    dirname,
    docker,
    ensureDirectory,
    exists,
    expand,
    extname,
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
    WriteLevel,
    writeTextFile,
} from "../deps.ts";
import { ValueBuilder } from "../_value_builder.ts";
import { IExecutionContext, IPackageExecutionContext, ISecretsSection } from "../interfaces.ts";
import { savePackageCache } from "../config/mod.ts";
import { blue } from "../cli_deps.ts";

async function generateEnvFile(ctx: IPackageExecutionContext, force: boolean, vb: ValueBuilder, secretsFile?: string) {
    secretsFile ??= ctx.package.secretsFile;
    const isDebug = ctx.host.enabled(WriteLevel.Debug);

    if (!await exists(secretsFile)) {
        if (isDebug) {
            ctx.host.debug(`The secrets file was not found on disk: ${blue(secretsFile)}`);
        }
        return;
    }

    const service = ctx.package.spec.service ?? ctx.package.spec.name;
    const composeDir = join(ctx.config.paths.data, "etc", "aft", service);
    const envFile = join(composeDir, ".env");
    let writeFile = true;
    if (await exists(envFile) && !force) {
        writeFile = false;
        if (isDebug) {
            ctx.host.debug(`Skip writing file that already exists: ${blue(secretsFile)}`);
        }
    }

    const content = await readTextFile(secretsFile);
    if (isDebug) {
        ctx.host.writeLine();
        ctx.host.debug("**secrets file**");
        ctx.host.debug(content);
    }

    const sections = parseYaml(content) as ISecretsSection[];
    if (isDebug) {
        ctx.host.writeLine();
        ctx.host.writeLine(JSON.stringify(sections, null, 4));
    }
    let envText = "";
    const env: Record<string, string | undefined> = {};
    for (let i = 0; i < sections.length; i++) {
        const s = sections[i];
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
                    env[s.name] = "";
                    ctx.host.warn(`Secret ${s.name} using ${s.path} has no value and is not generated`);
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

    // we add the decrypted secrets to the values for the
    // the case of rendering configuration templates.
    vb.add({ secrets: env });
    if (writeFile) {
        await ensureDirectory(composeDir);
        await writeTextFile(envFile, envText);

        if (ctx.config.sops.enabled && ctx.config.sops.recipient) {
            // required for sops using age encryption
            set("SOPS_AGE_RECIPIENTS", ctx.config.sops.recipient!);
            set("SOPS_AGE_KEY_FILE", join(ctx.config.paths.config, "age.key"));
            hostWriter.info(`The .env file was encrypted with sops ${blue(envFile)}`);
            await sops(["-e", "-i", envFile]);
        }
    }
}

async function walk(
    ctx: IExecutionContext,
    src: string,
    srcOverride: string,
    dest: string,
    hb: typeof handlebars,
    locals: Record<string, unknown>,
    force: boolean,
) {
    const isDebug = ctx.host.enabled(WriteLevel.Debug);
    for await (const entry of Deno.readDir(src)) {
        const path = join(src, entry.name);
        const pathOverride = srcOverride.length == 0 ? "" : join(srcOverride, entry.name);
        if (entry.isDirectory) {
            await walk(ctx, path, pathOverride, join(dest, entry.name), hb, locals, force);
        } else {
            await ensureDirectory(dest);
            let target = path;
            if (pathOverride.length && await exists(pathOverride)) {
                target = pathOverride;
            }

            let destPath = join(dest, entry.name);
            if (target.endsWith(".hbs")) {
                destPath = destPath.substring(0, destPath.length - 4);
                if (!force && await exists(destPath)) {
                    if (isDebug) {
                        ctx.host.debug(`skip overwriting existing file at ${blue(destPath)}`);
                    }

                    continue;
                }

                const tplContent = await readTextFile(target);
                const tpl = hb.compile(tplContent);
                const content = tpl(locals);

                if (isDebug) {
                    ctx.host.debug(`rendered ${blue(path)} to ${blue(destPath)}`);
                }

                await writeTextFile(destPath, content);
                continue;
            }

            if (!force && await exists(destPath)) {
                if (isDebug) {
                    ctx.host.debug(`skip overwriting existing file at ${blue(destPath)}`);
                }

                continue;
            }

            await copy(target, destPath, { overwrite: true });
            if (isDebug) {
                ctx.host.debug(`copied ${blue(path)} to ${blue(destPath)}`);
            }
        }
    }
}

export interface IUnpackOptions {
    ctx: IPackageExecutionContext;
    overridesDir?: string;
    valueFiles?: string[];
    inspect?: boolean;
    force?: boolean;
}

export async function unpack(options: IUnpackOptions) {
    const { ctx, overridesDir, valueFiles, inspect } = options;
    const isDebug = ctx.host.enabled(WriteLevel.Debug);

    let force = options.force ?? false;

    if (force) {
        const svcName = ctx.package.spec.service ?? ctx.package.spec.name;
        const r = await docker(["ps", "--filter", `name=${svcName}`, "-q"], {
            stdout: "piped",
            stderr: "piped",
        });
        const lines = r.stdoutAsLines.filter((o) => o.length > 0);
        if (r.code === 0 && lines.length) {
            force = false;
            ctx.host.warn(`Unable to force overwriting files. docker container ${blue(svcName)} still running.`);
        }
    }

    const vb = new ValueBuilder();
    vb.addDefaults(ctx);

    let secretsFile = ctx.package.secretsFile;
    let valuesFile = ctx.package.valuesFile;
    const pkgDir = dirname(ctx.package.file);
    let dockerFile = join(pkgDir, "Dockerfile");

    if (overridesDir) {
        if (await exists(overridesDir)) {
            const secretsFileOverride = join(overridesDir, "secrets.yaml");
            const valuesFileOverride = join(overridesDir, "values.yaml");
            const dockerFileOverride = join(overridesDir, "Dockerfile");

            if (await exists(secretsFileOverride)) {
                secretsFile = secretsFileOverride;
            }

            if (await exists(valuesFileOverride)) {
                valuesFile = valuesFileOverride;
            }

            if (await exists(dockerFileOverride)) {
                dockerFile = dockerFileOverride;
            }
        }
    }

    // this is the default values file that comes with the package
    await vb.addYamlFile(ctx.package.valuesFile);

    if (valueFiles) {
        if (isDebug) {
            ctx.host.debug(`value files: ${JSON.stringify(valueFiles, null, 4)}`);
        }

        await vb.addYamlFile(valueFiles);
    }

    secretsFile ??= ctx.package.secretsFile;

    if (isDebug) {
        ctx.host.debug(`secret files: ${secretsFile}`);
    }

    let locals = vb.build();
    const composeFile = ctx.package.composeFile;

    // defaults to the name, if service isn't set.
    // the service name
    const service = (locals.service ?? locals.name) as string | undefined;
    if (!service) {
        throw new Error("No service name specified. Ensure that the values file contains a service or name property");
    }

    // .local/share/aft
    //    etc
    //      /aft/<service>
    //    var
    //      log/<service>
    //      tmp/<service>
    //      cache/<service>

    // .local/share/aft/cmp/
    const composeDir = join(ctx.config.paths.data, "etc", "aft", service);
    if (isDebug) {
        ctx.host.debug(`compose dir: ${blue(composeDir)}`);
    }

    await ensureDirectory(composeDir);
    await generateEnvFile(ctx, force, vb, secretsFile);

    locals = vb.build();
    if (inspect) {
        ctx.host.info("Values:");
        ctx.host.writeLine(JSON.stringify(locals, null, 4));
        ctx.host.writeLine();
    }

    const outFile = join(composeDir, "compose.yaml");
    let content = "";
    if (force || !await exists(outFile)) {
        const hbs = handlebars.create();
        registerHandlebarsDefaults(hbs);
        const template = await readTextFile(composeFile);
        content = hbs.compile(template)(locals);

        if (inspect) {
            ctx.host.info("compose.yaml:");
            ctx.host.writeLine(content);
            ctx.host.writeLine();
        }

        await writeTextFile(outFile, content);
    } else {
        content = await readTextFile(outFile);
        if (isDebug) {
            ctx.host.debug("compose file template evaluation skipped");
        }
    }

    let cacheEntry = ctx.cache.entries.find((e) => e.name === service);
    if (!cacheEntry) {
        cacheEntry = {
            packageDir: pkgDir,
            composeDir: composeDir,
            name: service,
            version: ctx.package.spec.version,
            valuesFiles: [valuesFile, ...valueFiles ?? []],
            secretsFile: secretsFile,
        };
        ctx.cache.entries.push(cacheEntry);
    } else {
        cacheEntry.packageDir = pkgDir;
        cacheEntry.composeDir = composeDir;
        cacheEntry.version = ctx.package.spec.version;
        cacheEntry.valuesFiles = [valuesFile, ...valueFiles ?? []];
        cacheEntry.secretsFile = secretsFile;
    }

    const composeData = parseYaml(content) as Record<string, unknown>;
    if (composeData.services) {
        const services = composeData.services as Record<string, unknown>;
        for (const prop in services) {
            if (services[prop]) {
                const service = services[prop] as Record<string, unknown>;
                if (service.volumes) {
                    const volumes = service.volumes as string[];
                    for (const v of volumes) {
                        const parts = v.split(":");
                        if (parts.length) {
                            const hostFolder = parts[0];
                            if (extname(hostFolder) === "") {
                                await ensureDirectory(hostFolder);
                            }
                        }
                    }
                }
            }
        }
    }

    await savePackageCache(ctx.cache);
    if (await exists(dockerFile)) {
        const dockerFileDest = join(composeDir, "Dockerfile");
        if (force || !await exists(dockerFileDest)) {
            await copy(dockerFile, dockerFileDest, { overwrite: force });
        } else {
            if (isDebug) {
                ctx.host.debug(`skip overwriting existing file at ${blue(dockerFileDest)}`);
            }
        }
    }

    if (locals.volumes) {
        const volumes = locals.volumes as Record<string, unknown>;
        for (const key in volumes) {
            let value = volumes[key] as string;
            value = expand(value);
            volumes[key] = value;

            if (!value || value.length === 0) {
                continue;
            }

            const childDir = join(pkgDir, key);
            const childOveride = overridesDir === undefined ? "" : join(overridesDir, key);
            if (await exists(childDir)) {
                await walk(ctx, childDir, childOveride, value, handlebars, locals, force || false);
            }
        }
    }
}

export async function up(ctx: IPackageExecutionContext) {
    const isDebug = ctx.host.enabled(WriteLevel.Debug);
    const service = ctx.package.spec.service ?? ctx.package.spec.name;
    const composeDir = join(ctx.config.paths.data, "etc", "aft", service);
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

    if (isDebug) {
        hostWriter.debug(
            `useSops: ${useSops}. enabled: ${ctx.config.sops.enabled}, recipient: ${ctx.config.sops.recipient}`,
        );
    }

    if (await exists(envFile)) {
        args.envFile = [envFile];

        if (useSops) {
            set("SOPS_AGE_RECIPIENTS", ctx.config.sops.recipient!);
            set("SOPS_AGE_KEY_FILE", join(ctx.config.paths.config, "age.key"));
            // this could be simplified by getting the env file via stdout and then
            // parsing with dotenv() and then loading as in process environment variables
            if (isDebug) {
                hostWriter.debug(`decrypting env file ${blue(envFile)}`);
            }

            await sops(["-d", "-i", envFile]);
        }
    } else {
        useSops = false;
    }

    try {
        await composeUp(args);
    } finally {
        if (useSops) {
            if (isDebug) {
                hostWriter.debug(`encrypting env file ${blue(envFile)}`);
            }

            await sops(["-e", "-i", envFile]);
        }
    }
}

export async function down(ctx: IPackageExecutionContext) {
    const isDebug = ctx.host.enabled(WriteLevel.Debug);
    const service = ctx.package.spec.service ?? ctx.package.spec.name;
    const composeDir = join(ctx.config.paths.data, "etc", "aft", service);
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

    hostWriter.debug(
        `useSops: ${useSops}. enabled: ${ctx.config.sops.enabled}, recipient: ${ctx.config.sops.recipient}`,
    );
    if (await exists(envFile)) {
        args.envFile = [envFile];

        if (useSops) {
            set("SOPS_AGE_RECIPIENTS", ctx.config.sops.recipient!);
            set("SOPS_AGE_KEY_FILE", join(ctx.config.paths.config, "age.key"));
            if (isDebug) {
                hostWriter.debug(`decrypting env file ${blue(envFile)}`);
            }
            await sops(["-d", "-i", envFile]);
        }
    } else {
        useSops = false;
    }

    try {
        await composeDown(args);
    } finally {
        if (useSops) {
            if (isDebug) {
                hostWriter.debug(`encrypting env file ${blue(envFile)}`);
            }
            await sops(["-e", "-i", envFile]);
        }
    }
}
