// Smoke test: load bundled api/mock.mjs the same way Vercel's Node runtime
// would, and drive a fake login request through it. Catches import/runtime
// errors (module-not-found, ESM/CJS mismatch, etc.) before deploying.
import { createServer } from "http";

const mod = await import("../api/mock.mjs");
const handler = mod.default;

// Vercel populates req.query from rewrite params (?__sub=...); a plain
// http.IncomingMessage doesn't have that, so attach it manually here.
const server = createServer((req, res) => {
  req.query = { __sub: "auth/login" };
  handler(req, res);
});
await new Promise((resolve) => server.listen(0, resolve));
const { port } = server.address();

const body = JSON.stringify({ username: "admin", password: "admin" });
const resp = await fetch(`http://127.0.0.1:${port}/api/mock`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body,
});
const text = await resp.text();
console.log("status:", resp.status);
console.log("body:", text);
server.close();

if (resp.status !== 200) {
  console.error("[test-api-mjs] FAILED");
  process.exit(1);
}
console.log("[test-api-mjs] OK");
