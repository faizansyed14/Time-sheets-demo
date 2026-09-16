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

await esbuild.build({
  entryPoints: {
    mock: join(root, "mock", "vercel-mock-entry.ts"),
    health: join(root, "mock", "vercel-health-entry.ts"),
  },
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  outdir: join(root, "api"),
  logLevel: "info",
});

console.log("[bundle-api] wrote api/mock.js and api/health.js");
