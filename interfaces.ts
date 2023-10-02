import { IHostWriter } from "./deps.ts";
import { IAftPackage } from "./package/interfaces.ts";

export interface IAftDefaultNetwork {
    cidr: [number, number, number, number];
    name: string;
}

export interface IPackageCacheEntry {
    name: string;
    version: string;
    packageDir: string;
    composeDir: string;
    valuesFiles: string[];
    secretsFile: string;
}

export interface IPackageCache {
    entries: IPackageCacheEntry[];
}

export interface IAftConfig extends Record<string, unknown> {
    defaults: {
        dns: {
            domain: string;
            subdomain?: string;
        };
        tz: string;
        puid: number;
        pgid: number;
        networks: Record<string, IAftDefaultNetwork>;
    };
    paths: {
        data: string;
        config: string;
    };
    mkcert: {
        enabled: boolean;
        domains: string[];
    };
    network: {
        name: string;
        subnet: string;
        gateway: string;
    };
    sops: {
        enabled: boolean;
        provider: string;
        recipient?: string;
    };
}

export interface ISecretStore {
    get(path: string): Promise<string | undefined>;
    set(path: string, value: string): Promise<void>;
    remove(name: string): Promise<void>;
    list(): Promise<string[]>;
}

export interface ISecretsSection {
    name: string;
    path: string;
    default?: string;
    length?: number;
    create?: boolean;
    digits?: boolean;
    symbols?: boolean;
    uppercase?: boolean;
    lowercase?: boolean;
}

export interface ISecretsImportSection extends Record<string, string | undefined> {
    path: string;
    password: string;
    url?: string;
    notes?: string;
    username?: string;
}

export interface IExecutionContext {
    readonly secretStore: ISecretStore;
    readonly config: IAftConfig;
    readonly host: IHostWriter;
    readonly cache: IPackageCache;
    readonly globalPackagesDir: string;
}

export interface IPackageExecutionContext extends IExecutionContext {
    readonly package: IAftPackage;
}
