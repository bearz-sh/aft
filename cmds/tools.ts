import { Command, blue } from "../cli_deps.ts";
import { ExecutionContext } from "../tasks/context.ts";
import { check } from "../tasks/setup.ts";
import { installTools } from "../tasks/tools.ts";


const installCommand = new Command()
    .description("installs tool dependencies for aft")
    .action(async () => {
        const ctx = await ExecutionContext.create();
        ctx.host.writeLine(blue("installing tools..."));
        await installTools();
        ctx.host.success("done");
    })

export const toolsCommand = new Command()
    .description("tools for aft")
    .action(async () => {
        const ctx = await ExecutionContext.create();
        ctx.host.writeLine(blue("running checking tool check"));
        await check(ctx)
        ctx.host.success("done");
    })
    .command("install", installCommand);
