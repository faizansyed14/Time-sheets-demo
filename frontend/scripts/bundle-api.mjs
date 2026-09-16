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

// Vercel's Node builder repackages every function as api/<name>.js inside
// the deployed lambda regardless of our source extension (.mjs got renamed
// back to .js in production, which then broke under the root "type":"module").
// Fix: output CJS + a nested api/package.json{"type":"commonjs"} scopes this
// folder back to CommonJS regardless of what Vercel names the output file.
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
