import { ExecutionContext, PackageExecutionContext } from "./tasks/context.ts";
// import { setup } from "./tasks/setup.ts";
// import { installTools } from "./tasks/tools.ts";

import { down, unpack, up } from "./tasks/mod.ts";
import { dirname, fromFileUrl, join, preCallHooks } from "./deps.ts";
import { IPsStartInfo } from "https://deno.land/x/quasar@0.0.5/mod.ts";

preCallHooks.push((si: IPsStartInfo) => {
    console.log(si.file, si.args?.join(" "));
});

const dir = dirname(fromFileUrl(import.meta.url));
const traefik = join(dir, "_data", "traefik");

console.log(down);
const ctx = await ExecutionContext.create();
const pctx = await PackageExecutionContext.create(ctx, traefik);
await unpack(pctx);
await up(pctx);
