import {
    createKdbxCredentials,
    dirname,
    ensureDirectory,
    exists,
    get,
    hostWriter,
    join,
    kdbx,
    KpDatabase,
    readFile,
    readTextFile,
    secretGenerator,
    writeFile,
} from "../deps.ts";
import { ISecretsImportSection, ISecretStore } from "../interfaces.ts";
import { load } from "../config/mod.ts";

export async function getKdbxLocation() {
    const config = await load();
    const dir = get("AFT_KEEPASS") || join(config.paths.data, "etc", "aft");
    return join(dir, "aft.kdbx");
}

export async function getKdbxKeyLocation() {
    const config = await load();
    const keyFile = get("AFT_KEEPASS_KEYFILE") ?? join(config.paths.config, "aft.key");
    return keyFile;
}

export async function getOrCreateKey() {
    const envKey = get("AFT_KEEPASS_KEY");

    if (envKey) {
        return new TextEncoder().encode(envKey);
    }

    const keyFile = await getKdbxKeyLocation();
    const dir = dirname(keyFile);
    if (!await exists(dir)) {
        await ensureDirectory(dir);
    }

    if (await exists(keyFile)) {
        return await readFile(keyFile);
    }

    const key = secretGenerator.generateAsUint8Array(33);
    await writeFile(keyFile, key);
    hostWriter.warn(`Backup your new key file at ${keyFile}`);
    return key;
}

export class KeePassSecretStore implements ISecretStore {
    #db: KpDatabase;

    constructor(db: KpDatabase) {
        this.#db = db;
    }

    get db() {
        return this.#db;
    }

    async get(path: string): Promise<string | undefined> {
        const entry = await this.#db.findEntry(path, true);
        if (!entry) {
            return "";
        }

        const v = entry.fields.get("Password");
        if (v instanceof kdbx.ProtectedValue) {
            return v.getText();
        }

        return v as string;
    }

    async set(path: string, value: string): Promise<void> {
        const entry = await this.#db.getEntry(path);
        entry.fields.set("Password", kdbx.ProtectedValue.fromString(value));

        await this.#db.save();
    }

    remove(name: string): Promise<void> {
        const entry = this.#db.findEntry(name, true);
        if (entry) {
            this.#db.db.remove(entry);
        }
        return this.#db.save();
    }

    list(): Promise<string[]> {
        const names: string[] = [];
        for (const entry of this.#db.db.getDefaultGroup().allEntries()) {
            const tree: string[] = [];
            let parent = entry.parentGroup;
            while (parent) {
                if (!parent || !parent.name || parent.name === "Root") {
                    break;
                }
                tree.push(parent.name);
                parent = parent.parentGroup;
            }
            tree.pop();
            tree.reverse();
            const v = entry.fields.get("Title");
            if (typeof v === "string") {
                names.push(`${tree.join("/")}/${v}`);
                continue;
            }

            if (v instanceof kdbx.ProtectedValue) {
                names.push(`${tree.join("/")}/${v.getText()}`);
                continue;
            }
        }

        return Promise.resolve(names);
    }
}

let secretStore: ISecretStore | undefined = undefined;
let defaultKdbx: KpDatabase | undefined = undefined;

export async function getOrCreateDefaultKdbx() {
    if (defaultKdbx) {
        return defaultKdbx;
    }

    const config = await load();
    const dir = get("AFT_KEEPASS") || join(config.paths.data, "etc");
    if (!await exists(dir)) {
        await ensureDirectory(dir);
    }
    const kdbxFile = join(dir, "aft.kdbx");
    const secret = await getOrCreateKey();
    const credentials = createKdbxCredentials(secret);
    if (await exists(kdbxFile)) {
        defaultKdbx = await KpDatabase.open(kdbxFile, credentials);
    } else {
        defaultKdbx = await KpDatabase.create(kdbxFile, credentials);
    }

    return defaultKdbx;
}

export async function importSecrets(importFile: string, overwrite = false) {
    if (!await exists(importFile)) {
        throw new Error(`Import file ${importFile} does not exist`);
    }

    const content = await readTextFile(importFile);
    const unknownJson = JSON.parse(content);
    if (!Array.isArray(unknownJson)) {
        throw new Error(`Import file ${importFile} is not a valid JSON array`);
    }

    const records = unknownJson as ISecretsImportSection[];
    const db = await getOrCreateDefaultKdbx();

    for (let i = 0; i < records.length; i++) {
        const r = records[i];
        if (!r.path) {
            throw new Error(`Import file ${importFile} record ${i} has no path`);
        }

        if (!r.password) {
            throw new Error(`Import file ${importFile} record ${i} has no password`);
        }

        const entry = await db.getEntry(r.path);
        if (entry && !overwrite) {
            hostWriter.warn(`Secret ${r.path} already exists`);
            continue;
        }

        entry.fields.set("Password", kdbx.ProtectedValue.fromString(r.password));
        if (r.url) {
            entry.fields.set("URL", r.url);
        }

        if (r.notes) {
            entry.fields.set("Notes", r.notes);
        }

        if (r.username) {
            entry.fields.set("UserName", r.username);
        }
    }

    await db.save();
}

export async function getOrCreateDefaultStore() {
    if (secretStore) {
        return secretStore;
    }

    const db = await getOrCreateDefaultKdbx();
    secretStore = new KeePassSecretStore(db);

    return secretStore;
}
