import { deepMerge, IS_DARWIN, IS_LINUX, IS_WINDOWS, OS_FAMILY, OS_RELEASE, parseYaml, readTextFile } from "./deps.ts";
import { IPackageExecutionContext } from "./interfaces.ts";

export class ValueBuilder {
    #locals: Record<string, unknown>;

    constructor(initial?: Record<string, unknown>) {
        this.#locals = initial ?? {};
    }

    addDefaults(ctx: IPackageExecutionContext) {
        const service = ctx.package.spec.service ?? ctx.package.spec.name;
        const dataDir = ctx.config.paths.data;
        const o: Record<string, unknown> = {
            ...ctx.config.defaults,
            name: ctx.package.spec.name,
            service,
            image: ctx.package.spec.image,
            os: {
                family: OS_FAMILY,
                release: OS_RELEASE,
                windows: IS_WINDOWS,
                linux: IS_LINUX,
                darwin: IS_DARWIN,
            },
            volumes: {
                etc: `${dataDir}/etc/${service}`,
                data: `${dataDir}/data/${service}`,
                certs: `${dataDir}/etc/certs`,
                logs: `${dataDir}/var/logs/${service}`,
                tmp: `${dataDir}/var/tmp/${service}`,
                cache: `${dataDir}/var/cache/${service}`,
            },
            secrets: {},
        };

        this.add(o);
    }

    add(values: Record<string, unknown>) {
        this.#locals = deepMerge(this.#locals, values);
    }

    async addJsonFile(files: string[] | string) {
        if (!Array.isArray(files)) {
            files = [files];
        }

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const content = await readTextFile(file);
            const data = JSON.parse(content) as Record<string, unknown>;
            this.#locals = deepMerge(this.#locals, data);
        }
    }

    async addYamlFile(files: string[] | string) {
        if (!Array.isArray(files)) {
            files = [files];
        }

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const content = await readTextFile(file);
            const data = parseYaml(content) as Record<string, unknown>;
            this.#locals = deepMerge(this.#locals, data);
        }
    }

    build() {
        return this.#locals;
    }
}
