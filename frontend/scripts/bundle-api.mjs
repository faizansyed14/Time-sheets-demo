/**
 * Bundle mock API into single CJS files for Vercel.
 * ESM + "type":"module" cannot load extensionless ../mock/*.ts at runtime.
 */
import * as esbuild from "esbuild";
import { mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
mkdirSync(join(root, "api"), { recursive: true });

// Output pure ESM (.mjs) — frontend/package.json has "type":"module", so a
// bundled .js file would be parsed as ESM anyway but with CJS syntax inside
// (module.exports), causing "exports is not defined". .mjs is unambiguous.
await esbuild.build({
  entryPoints: {
    mock: join(root, "mock", "vercel-mock-entry.ts"),
    health: join(root, "mock", "vercel-health-entry.ts"),
  },
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  outdir: join(root, "api"),
  outExtension: { ".js": ".mjs" },
  logLevel: "info",
});

console.log("[bundle-api] wrote api/mock.mjs and api/health.mjs");
