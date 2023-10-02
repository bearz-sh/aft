import { deepMerge, dirname, exists, join, makeDirectory, readTextFile, writeTextFile } from "../deps.ts";
import { IAftConfig, IPackageCache } from "../interfaces.ts";
import { paths } from "../_paths.ts";

export function createDefaults() {
    const settings: IAftConfig = {
        paths: {
            data: paths.userDataDir.replace(/\\/g, "/"),
            config: paths.userConfigDir.replace(/\\/g, "/"),
        },
        sops: {
            enabled: true,
            provider: "age",
        },
        defaults: {
            dns: {
                domain: "aft.bearz.casa",
            },
            tz: "UTC",
            puid: 0,
            pgid: 0,
            networks: {
                default: {
                    cidr: [172, 19, 0, 0],
                    name: "aft",
                },
            },
        },
        network: {
            name: "aft",
            subnet: "172.19.0.0/20",
            gateway: "172.19.0.1",
        },
        mkcert: {
            enabled: true,
            domains: [
                "*.aft.bearz.casa",
                "aft.bearz.casa",
                "localhost",
            ],
        },
    };

    return settings;
}

export function getLocation() {
    const dir = paths.userConfigDir;
    return join(dir, "aft.config");
}
export async function loadPackageCache(path?: string) {
    let dir = "";
    if (path === undefined) {
        dir = paths.userConfigDir;
        path = join(dir, "aft.cache");
    } else {
        dir = dirname(path);
    }
    if (!await exists(path!)) {
        await makeDirectory(dir, { recursive: true });

        const settings: IPackageCache = {
            entries: [],
        };
        const json = JSON.stringify(settings, null, 4);
        await writeTextFile(path!, json);

        return settings;
    }

    const json = await readTextFile(path!);
    const settings = JSON.parse(json) as IPackageCache;
    return settings;
}

export async function savePackageCache(config: IPackageCache, path?: string) {
    if (!path) {
        path = join(paths.userConfigDir, "aft.cache");
    }
    const dir = dirname(path!);
    if (!await exists(dir)) {
        await makeDirectory(dir, { recursive: true });
    }

    const json = JSON.stringify(config, null, 4);
    await writeTextFile(path!, json);
}

export async function load(path?: string) {
    let dir = "";
    if (path === undefined) {
        dir = paths.userConfigDir;
        path = join(dir, "aft.config");
    } else {
        dir = dirname(path);
    }
    if (!await exists(path!)) {
        await makeDirectory(dir, { recursive: true });

        const settings = createDefaults();
        const json = JSON.stringify(settings, null, 4);
        await writeTextFile(path!, json);

        return settings;
    }

    const json = await readTextFile(path!);
    const settings = JSON.parse(json) as IAftConfig;
    return settings;
}

export async function importOverrides(path: string) {
    if (!await exists(path)) {
        throw new Error(`Import file ${path} does not exist`);
    }

    const content = await readTextFile(path);
    const unknownJson = JSON.parse(content) as Record<string, unknown>;
    const settings = await load();
    deepMerge(settings as Record<string, unknown>, unknownJson, { arrays: "replace" });
    await save(settings);
}

export async function save(config: IAftConfig, path?: string) {
    if (!path) {
        path = join(paths.userConfigDir, "aft.config");
    }
    const dir = dirname(path!);
    if (!await exists(dir)) {
        await makeDirectory(dir, { recursive: true });
    }

    const json = JSON.stringify(config, null, 4);
    await writeTextFile(path!, json);
}
