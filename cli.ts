import { Command, CompletionsCommand, HelpCommand } from "https://deno.land/x/cliffy@v1.0.0-rc.3/command/mod.ts";
import { composeCommand } from "./cmds/core.ts";
import { secretsCommand } from "./cmds/secrets.ts";
import { hostWriter, IPsStartInfo, preCallHooks, WriteLevel } from "./deps.ts";
import { toolsCommand } from "./cmds/tools.ts";
import { configCommand } from "./cmds/config.ts";

preCallHooks.push((si: IPsStartInfo) => {
    hostWriter.command(si.file.toString(), si.args || []);
});

hostWriter.level = WriteLevel.Command;

if (Deno.args.includes("--debug") || Deno.args.includes("-d")) {
    hostWriter.level = WriteLevel.Debug;
}

if (Deno.args.includes("--verbose") || Deno.args.includes("-v")) {
    hostWriter.level = WriteLevel.Trace;
}

const cmd = new Command();
cmd
    .version("0.0.1")
    .description("aft docker compose templates")
    .globalOption("-d --debug [debug:boolean]", "enable debug mode")
    .globalOption("-v --verbose [verbose:boolean]", "enable trace (verbose) mode")
    .command("compose", composeCommand)
    .command("config", configCommand)
    .command("secrets", secretsCommand)
    .command("tools", toolsCommand)
    .command("completions", new CompletionsCommand())
    .command("help", new HelpCommand().global());

try {
    await cmd.parse(Deno.args);
} catch (error) {
    hostWriter.error(error);
    Deno.exit(1);
}
