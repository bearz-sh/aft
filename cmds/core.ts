
import { Command, blue, green } from "../cli_deps.ts";
import { hostWriter, join, resolve } from "../deps.ts";
import { PackageExecutionContext } from "../tasks/context.ts";
import { ExecutionContext } from "../tasks/context.ts";
import { unpack, up, down } from "../tasks/mod.ts";
import { setup } from "../tasks/setup.ts";


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

        const full = resolve(pkg);
        hostWriter.writeLine(`unpacking package ${blue(full)}`);

        const ctx = await ExecutionContext.create();
        const pctx = await PackageExecutionContext.create(ctx, pkg)
        await unpack(pctx, valueFile, secretFile, inspect ?? false);
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

        const full = resolve(pkg);
        hostWriter.writeLine(`starting up ${blue(full)}`);

        const ctx = await ExecutionContext.create();
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

        const full = resolve(pkg);
        hostWriter.writeLine(`shutting down ${blue(full)}`);

        const ctx = await ExecutionContext.create();
        const pctx = await PackageExecutionContext.create(ctx, pkg)
        await down(pctx);
        hostWriter.writeLine(green("done"));
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
        .command("down", downCommand);