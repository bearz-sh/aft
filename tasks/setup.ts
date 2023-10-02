import {
    caRootDir,
    createAgeKey,
    ensureDirectory,
    exists,
    generateMkCert,
    join,
    mkcert,
    readTextFile,
    which,
    writeTextFile,
} from "../deps.ts";
import { save } from "../config/mod.ts";
import { IExecutionContext } from "../interfaces.ts";
import { create } from "./network.ts";

export async function setupLocalCerts(ctx: IExecutionContext) {
    const certsDir = join(ctx.config.paths.data, "etc", "certs");
    const cert = join(certsDir, "aft.pem");
    const key = join(certsDir, "aft.key.pem");
    const chained = join(certsDir, "aft.chained.pem");
    const mkcertLocation = await which("mkcert");
    if (!mkcertLocation) {
        return { cert, chained, key };
    }

    await ensureDirectory(certsDir);

    const rootDir = await caRootDir();
    console.log(rootDir);
    const rootCert = join(rootDir, "rootCA.pem");
    console.log(rootCert);
    if (!await exists(rootCert)) {
        await mkcert(["-install"]);
    }

    if (!await exists(cert) || !await exists(key)) {
        await generateMkCert({
            domains: ctx.config.mkcert.domains,
            certPath: cert,
            keyPath: key,
        }).then((o) => o.throwOrContinue());
    }

    const chainedContent = await readTextFile(cert) + await readTextFile(rootCert);
    await writeTextFile(chained, chainedContent);

    return { cert, chained, key };
}

export async function check(ctx: IExecutionContext) {
    const tools = ["docker", "mkcert", "age", "sops"];

    const toolsEnabled: Record<string, boolean> = {
        "docker": true,
        "mkcert": true,
        "age": true,
        "sops": true,
    };

    for (const tool of tools) {
        if (!await which(tool)) {
            ctx.host.warn(`${tool} not installed.`);
            toolsEnabled[tool] = false;
        } else {
            ctx.host.success(`${tool} installed`);
        }
    }
}

export async function detect(ctx: IExecutionContext) {
    const tools = ["docker", "mkcert", "age", "sops"];

    const toolsEnabled: Record<string, boolean> = {
        "docker": true,
        "mkcert": true,
        "age": true,
        "sops": true,
    };

    for (const tool of tools) {
        if (!await which(tool)) {
            toolsEnabled[tool] = false;
        }
    }

    if (toolsEnabled["sops"] && toolsEnabled["age"]) {
        if (!ctx.config.sops.enabled) {
            ctx.config.sops.enabled = true;
            ctx.host.success("sops enabled");
        }
    }

    if (toolsEnabled["mkcert"]) {
        if (!ctx.config.sops.enabled) {
            ctx.config.mkcert.enabled = true;
            ctx.host.success("mkcert enabled");
        }
    }

    await save(ctx.config).catch((err) => {
        if (err instanceof Error) {
            ctx.host.error(err);
        } else {
            ctx.host.error(`Unknown error saving config. ${err}`);
        }
    });
}

export async function setup(ctx: IExecutionContext) {
    const tools = ["docker", "mkcert", "age", "sops"];

    const toolsEnabled: Record<string, boolean> = {
        "docker": true,
        "mkcert": true,
        "age": true,
        "sops": true,
    };

    /*
    const dataDir = ctx.config.paths.data;
    const paths = [
        "etc",
        "etc/aft",
        "data",
        "var",
        "var/log",
        "var/cache",
        "var/tmp"
    ]

    for (const n of paths)
    {
        const dir = join(dataDir, n);
        // await ensureDirectory(dir);
    }*/

    for (const tool of tools) {
        if (!await which(tool)) {
            ctx.host.warn(`${tool} not installed.`);
            toolsEnabled[tool] = false;
        }
    }

    if (toolsEnabled["sops"] && toolsEnabled["age"] && ctx.config.sops.enabled) {
        try {
            ctx.host.info("Setting up sops");
            const ageKey = join(ctx.config.paths.config, "age.key");
            const { pubKeyFile } = await createAgeKey(ageKey);
            const pubKey = await readTextFile(pubKeyFile);
            ctx.config.sops.recipient = pubKey;
            await save(ctx.config);
        } catch (e) {
            if (e instanceof Error) {
                ctx.host.error(e);
            } else {
                ctx.host.error(`Unknown error setting up sops. ${e}`);
            }
        }
    }

    if (toolsEnabled["mkcert"] && ctx.config.mkcert.enabled) {
        ctx.host.info("Setting mkcert");
        await setupLocalCerts(ctx).catch((err) => {
            if (err instanceof Error) {
                ctx.host.error(err);
            } else {
                ctx.host.error(`Unknown error setting up local certs. ${err}`);
            }
        });
    }

    if (toolsEnabled["docker"]) {
        console.log("Setting up docker");
        await create(ctx).catch((err) => {
            if (err instanceof Error) {
                ctx.host.error(err);
            } else {
                ctx.host.error(`Unknown error setting up local network. ${err}`);
            }
        });
    }
}
