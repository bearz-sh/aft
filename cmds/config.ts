import { Command, blue } from "../cli_deps.ts";
import { getLocation, load } from "../config/mod.ts";
import { hostWriter, } from "../deps.ts";

export const createCommand = new Command()
    .description("creates a new aft config file if one does not exist")
    .action(async () => {
         await load();
         hostWriter.writeLine("config file is located at " + blue(getLocation()));
    });

export const configCommand = new Command()
    .description("config shows the config location for aft and may have sub commands in the future")
    .option("-s, --short [short:boolean]", "only show the location of the config file")
    .action(({short}) => {
        if(short) {
            hostWriter.writeLine(getLocation());
            return;
        }

        hostWriter.writeLine("config file is located at " + blue(getLocation()));
    })
    .command("create", createCommand);