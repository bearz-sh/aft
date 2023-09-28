import { Command, CompletionsCommand, HelpCommand } from "https://deno.land/x/cliffy@v1.0.0-rc.3/command/mod.ts";
import { setupCommand, composeCommand } from "./cmds/core.ts";
import { secretsCommand } from "./cmds/secrets.ts";
import { hostWriter } from "./deps.ts";
import { toolsCommand } from "./cmds/tools.ts";
import { configCommand } from "./cmds/config.ts";

const cmd = new Command();
cmd
    .version("0.0.1")
    .description("aft docker compose templates")
    .command("compose", composeCommand)
    .command("config", configCommand)
    .command("setup", setupCommand)
    .command("secrets", secretsCommand)
    .command("tools", toolsCommand)
    .command("completions", new CompletionsCommand())
    .command("help", new HelpCommand().global())

try {
    await cmd.parse(Deno.args);
} catch (error) {
    hostWriter.error(error);
    Deno.exit(1);
}