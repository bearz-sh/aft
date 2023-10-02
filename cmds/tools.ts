import { blue, Command, green } from "../cli_deps.ts";
import { ExecutionContext } from "../tasks/context.ts";
import { check, detect, setup } from "../tasks/setup.ts";
import { installTools } from "../tasks/tools.ts";

const installCommand = new Command()
    .description("installs tool dependencies for aft")
    .action(async () => {
        const ctx = await ExecutionContext.create();
        ctx.host.writeLine(blue("installing tools..."));
        await installTools();
        ctx.host.success("done");
    });

const setupCommand = new Command()
    .description(
        "sets up aft and configures the environment and tools. \n It may be good idea to run tools and tools install first.",
    )
    .action(async () => {
        const ctx = await ExecutionContext.create();
        ctx.host.writeLine(blue("setting up aft..."));
        await setup(ctx);
        ctx.host.writeLine(green("done"));
    });

const detechCommand = new Command()
    .description("detechs which tools are installed and updates the aft config e.g. mkcert, sops, etc")
    .action(async () => {
        const ctx = await ExecutionContext.create();
        ctx.host.writeLine(blue("detecting tools..."));
        await detect(ctx);
        ctx.host.writeLine(green("done"));
    });

const checkCommand = new Command()
    .description("checks which tools are installed and warns if they are not")
    .action(async () => {
        const ctx = await ExecutionContext.create();
        ctx.host.writeLine(blue("checking for installed tools..."));
        await check(ctx);
        ctx.host.writeLine(green("done"));
    });

export const toolsCommand = new Command()
    .description("tools for aft")
    .action(async () => {
        const ctx = await ExecutionContext.create();
        ctx.host.writeLine(blue("running checking tool check"));
        await check(ctx);
        ctx.host.success("done");
    })
    .command("install", installCommand)
    .command("setup", setupCommand)
    .command("detect", detechCommand)
    .command("check", checkCommand);
