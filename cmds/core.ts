
import { Command, blue, green } from "../cli_deps.ts";
import { basename, copy, dirname, exists, hostWriter, join, resolve, rm, semver } from "../deps.ts";
import { IExecutionContext } from "../interfaces.ts";
import { PackageExecutionContext } from "../tasks/context.ts";
import { ExecutionContext } from "../tasks/context.ts";
import { unpack, up, down } from "../tasks/mod.ts";
import { setup } from "../tasks/setup.ts";


async function getPackageVersion(pkg: string, ctx: IExecutionContext): Promise<string> {

    const entry = ctx.cache.entries.find((e) => e.name === pkg);
    if (entry) {
        return entry.packageDir;
    } 

    const globalPkg = join(ctx.globalPackagesDir, pkg);
    if (await exists(globalPkg)) {
        const versions : semver.SemVer[] = [];
        for await (const entry of Deno.readDir(globalPkg)) {
            if (entry.isDirectory) {
                if (semver.isSemVer(entry.name)) {
                    versions.push(semver.parse(entry.name))
                }
            }
        }

        if (versions.length === 0)
        {
            throw new Error(`Package ${pkg} not found`);
        }

        if (versions.length === 1)
        {
            const version = versions[0];
            
            return join(globalPkg, semver.format(version, 'full'));
        }

        semver.sort(versions).reverse()

        const latest = versions[0];
        return join(globalPkg, semver.format(latest, 'full'));
    } 

    throw new Error(`Package ${pkg} not found`);
}

export const setupCommand = new Command()
    .description("sets up aft and configures the environment and tools. \n It may be good idea to run tools and tools install first.")
    .action(async () => {
        hostWriter.writeLine(blue("setting up aft..."));
        const ctx = await ExecutionContext.create();
        await setup(ctx);
        hostWriter.writeLine(green("done"));
    });


export const unpackCommand = new Command()
    .description("unpacks and renders handlebars templates")
    .arguments("<pkg:string>")
    .option("--value-file <value-file:string>", "path to a values file to override the default values", { collect: true })
    .option("--secret-file <secret-file:string>", "path to a secret file to override the default secrets")
    .option("-i --inspect [inspect:boolean]", "inspect the rendered templates")
    .action(async ({ valueFile, secretFile, inspect },  pkg?: string) => {
        if(pkg === undefined || pkg === null || pkg === "") {
            throw new Error("no package specified");
        }

        const ctx = await ExecutionContext.create();
        if (!await exists(pkg)) {
            pkg = await getPackageVersion(pkg, ctx);
        }

        const full = resolve(pkg);
        hostWriter.writeLine(`unpacking package ${blue(full)}`);


        const pctx = await PackageExecutionContext.create(ctx, pkg)
        await unpack(pctx, valueFile, secretFile, inspect ?? false);
        hostWriter.writeLine(green("done"));
    });

export const listCommand = new Command()
    .description("lists all packages that have been unpacked")
    .action(async () => {
        const ctx = await ExecutionContext.create();
        const cache = ctx.cache;
        for(const entry of cache.entries) {
            hostWriter.writeLine(entry.name.padEnd(20) + entry.version.padEnd(10) + entry.packageDir);
        }
    });

export const applyCommand = new Command()
    .description("unpacks the template and runs compose up on the package")
    .arguments("<pkg:string>")
    .option("--value-file <value-file:string>", "path to a values file to override the default values", { collect: true })
    .option("--secret-file <secret-file:string>", "path to a secret file to override the default secrets")
    .option("-i --inspect [inspect:boolean]", "inspect the rendered templates")
    .action(async ({ valueFile, secretFile, inspect },  pkg?: string) => {
        if(pkg === undefined || pkg === null || pkg === "") {
            throw new Error("no package specified");
        }

        const ctx = await ExecutionContext.create();
        if (!await exists(pkg)) {
            pkg = await getPackageVersion(pkg, ctx);
        }

        const full = resolve(pkg);
        hostWriter.writeLine(`unpacking package ${blue(full)}`);

       
        const pctx = await PackageExecutionContext.create(ctx, pkg)
        await unpack(pctx, valueFile, secretFile, inspect ?? false);
        await up(pctx);
        hostWriter.writeLine(green("done"));
    });

export const upCommand = new Command()
    .description("composes up the specified package")
    .arguments("<pkg:string>")
    .action(async (_o?: unknown, pkg?: string) => {
        if(pkg === undefined || pkg === null || pkg === "") {
            hostWriter.error("no package specified")
            return 1;
        }

        const ctx = await ExecutionContext.create();
        if (!await exists(pkg)) {
            pkg = await getPackageVersion(pkg, ctx);
        }

        const full = resolve(pkg);
        hostWriter.writeLine(`starting up ${blue(full)}`);
        const pctx = await PackageExecutionContext.create(ctx, pkg)
        await up(pctx);
        hostWriter.writeLine(green("done"));
    });

export const downCommand = new Command()
    .description("composes down the specified package")
    .arguments("<pkg:string>")
    .action(async (_o?: unknown, pkg?: string) => {
        if(pkg === undefined || pkg === null || pkg === "") {
            hostWriter.error("no package specified")
            return 1;
        }

        const ctx = await ExecutionContext.create();
        if (!await exists(pkg)) {
            pkg = await getPackageVersion(pkg, ctx);
        }
       

        const full = resolve(pkg);
        hostWriter.writeLine(`shutting down ${blue(full)}`);
        const pctx = await PackageExecutionContext.create(ctx, pkg)
        await down(pctx);
        hostWriter.writeLine(green("done"));
    });

    export const importCommand = new Command()
        .description("imports a package into the global package directory")
        .arguments("<pkg:string>")
        .action(async (_o?: unknown, pkg?: string) => {
            if(pkg === undefined || pkg === null || pkg === "") {
                throw new Error("no package specified");
            }

            if (pkg.endsWith("aft.yaml")) {
                pkg = dirname(pkg);
            } 

            const spec = join(pkg, "aft.yaml");
            const compose = join(pkg, "compose.yaml.hbs");
            const values = join(pkg, "values.yaml");

            for(const file of [spec, compose, values]) {
                if (!await exists(file)) {
                    throw new Error(`Package ${pkg} is missing ${file}`);
                }
            }

            const ctx = await ExecutionContext.create();
            const pctx = await PackageExecutionContext.create(ctx, spec);
            const version = pctx.package.spec.version;
            const name = pctx.package.spec.name;
            const dest = join(ctx.globalPackagesDir, name, version);
            if (await exists(dest)) {
                await rm(dest, { recursive: true });
            }
            await copy(pkg, dest, { overwrite: true });
            
        });

    export const composeCommand = new Command()
        .description("compose contains subcommands to compose aft packages. The default action prints the location of the aft compose file")
        .arguments("<pkg:string>")
        .action(async (_o?: unknown, pkg?: string) => {
            if(pkg === undefined || pkg === null || pkg === "") {
                throw new Error("no package specified");
            }
            const ctx = await ExecutionContext.create();
            const pctx = await PackageExecutionContext.create(ctx, pkg)
            const dir  = ctx.config.paths.data;
            const service = pctx.package.spec.service ?? pctx.package.spec.name;

            hostWriter.writeLine(join(dir, "etc", "compose", service, "compose.yaml"));
        })
        .command("unpack", unpackCommand)
        .command("up", upCommand)
        .command("down", downCommand)
        .command("apply", applyCommand)
        .command("import", importCommand);