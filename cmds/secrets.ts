
import { Command, blue, green } from "../cli_deps.ts";
import { hostWriter, } from "../deps.ts";
import { getKdbxLocation } from "../secrets/store.ts";
import { ExecutionContext } from "../tasks/context.ts";

const setCommand = new Command()
    .description("sets a secret value in the aft secrets file")
    .arguments("<path:string> <value:string>")
    .action(async (_o: unknown, path: string, value: string) => {
        const ctx = await ExecutionContext.create();
        ctx.secretStore.set(path, value);
        hostWriter.writeLine(green("done"));
    });

const getCommand = new Command()
    .description("gets a secret value in the aft secrets file")
    .arguments("<path:string>")
    .action(async (_o: unknown, path: string) => {
        const ctx = await ExecutionContext.create();
        const value = await ctx.secretStore.get(path);
        hostWriter.writeLine(value);
    });

export const secretsCommand = new Command()
    .description("allows manipluating secrets.")
    .option("-s, --short [short:boolean]", "only show the location of the secrets file")
    .action(async ({short}) => {
        const loc = await getKdbxLocation();
        if (short) {
            hostWriter.writeLine(loc);
            return;
        }
        hostWriter.writeLine("secret store is at " + blue(loc));
        hostWriter.writeLine("use AFT_KEEPASS_KEY to set the key location");
        hostWriter.writeLine("use AFT_KEEPASS to set the file location");
        hostWriter.writeLine("use the get and set commands to manipulate secrets or edit the keepass file directly");
    })
    .command("set", setCommand)
    .command("get", getCommand);