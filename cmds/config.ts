import { blue, Command } from "../cli_deps.ts";
import { getLocation, importOverrides, load } from "../config/mod.ts";
import { hostWriter } from "../deps.ts";

export const createCommand = new Command()
    .description("creates a new aft config file if one does not exist")
    .action(async () => {
        await load();
        hostWriter.writeLine("config file is located at " + blue(getLocation()));
    });

export const importCommand = new Command()
    .description("imports a config file into the aft config file and will merge the two files")
    .arguments("<path:string>")
    .action(async (_o?: unknown, path?: string) => {
        if (path === undefined || path === null || path === "") {
            throw new Error("no import file specified");
        }
        await importOverrides(path);
    });

export const getCommand = new Command()
    .description("gets a config value in the aft config file")
    .arguments("<path:string>")
    .action(async (_o?: unknown, path?: string) => {
        const config = await load();
        if (!path || path === "") {
            hostWriter.writeLine(JSON.stringify(config, null, 4));
            return;
        }

        const segments = path.split(".");
        let value: unknown = config;
        for (let i = 0; i < segments.length; i++) {
            const segment = segments[i];
            if (value === undefined || value === null) {
                hostWriter.error(`config value ${path} not found`);
                return;
            }

            if (typeof value === "object") {
                value = (value as Record<string, unknown>)[segment];
                continue;
            }

            if (Array.isArray(value)) {
                const index = parseInt(segment);
                if (isNaN(index)) {
                    hostWriter.error(`config value ${path} not found`);
                    return;
                }
                value = value[index];
                continue;
            }

            if (value === undefined) {
                hostWriter.error(`config value ${path} not found`);
                return;
            }
        }

        hostWriter.writeLine(JSON.stringify(value, null, 4));
    });

export const configCommand = new Command()
    .description("config shows the config location for aft and may have sub commands in the future")
    .option("-s, --short [short:boolean]", "only show the location of the config file")
    .action(({ short }) => {
        if (short) {
            hostWriter.writeLine(getLocation());
            return;
        }

        hostWriter.writeLine("config file is located at " + blue(getLocation()));
    })
    .command("create", createCommand)
    .command("import", importCommand)
    .command("get", getCommand);
