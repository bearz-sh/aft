import { hostWriter, IHostWriter, join } from "../deps.ts";
import { IAftConfig, IExecutionContext, IPackageCache, IPackageExecutionContext, ISecretStore } from "../interfaces.ts";
import { load, loadPackageCache } from "../config/mod.ts";
import { getOrCreateDefaultStore } from "../secrets/store.ts";
import { IAftPackage } from "../package/interfaces.ts";
import { AftPackage } from "../package/mod.ts";

export class ExecutionContext implements IExecutionContext {
    readonly secretStore: ISecretStore;
    readonly config: IAftConfig;
    readonly host: IHostWriter;
    readonly cache: IPackageCache;
    readonly globalPackagesDir: string;

    constructor(secureStore: ISecretStore, config: IAftConfig, host: IHostWriter, cache: IPackageCache, globalPackagesDir: string) {
        this.secretStore = secureStore;
        this.config = config;
        this.host = host;
        this.cache = cache;
        this.globalPackagesDir = globalPackagesDir;
    }

    static async create(
        secretStore?: ISecretStore,
        config?: IAftConfig,
        host?: IHostWriter,
        cache?: IPackageCache,
    ): Promise<IExecutionContext> {
        config ??= await load();
        host ??= hostWriter;
        secretStore ??= await getOrCreateDefaultStore();
        cache ??= await loadPackageCache();
        const globalPackagesDir = join(config.paths.data, "packages");

        return new ExecutionContext(secretStore, config, host, cache, globalPackagesDir);
    }
}

export class PackageExecutionContext implements IPackageExecutionContext {
    readonly package: IAftPackage;
    readonly secretStore: ISecretStore;
    readonly config: IAftConfig;
    readonly host: IHostWriter;
    readonly cache: IPackageCache;
    readonly globalPackagesDir: string;

    constructor(executionContext: IExecutionContext, pkg: IAftPackage) {
        this.package = pkg;
        this.secretStore = executionContext.secretStore;
        this.config = executionContext.config;
        this.host = executionContext.host;
        this.cache = executionContext.cache;
        this.globalPackagesDir = executionContext.globalPackagesDir;
    }

    static async create(executionContext: IExecutionContext, pkgFile: string): Promise<IPackageExecutionContext> {
        const pkg = await AftPackage.load(pkgFile);
        return new PackageExecutionContext(executionContext, pkg);
    }
}
