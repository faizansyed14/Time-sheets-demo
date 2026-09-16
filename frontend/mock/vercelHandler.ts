import type { IncomingMessage, ServerResponse } from "http";
import { mockMiddleware } from "./router";

/** Preserve original path when Vercel rewrites or strips req.url. */
function requestUrl(req: IncomingMessage): string {
  const h = req.headers;
  const fromHeader =
    (typeof h["x-vercel-original-url"] === "string" && h["x-vercel-original-url"]) ||
    (typeof h["x-invoke-path"] === "string" && h["x-invoke-path"]) ||
    (typeof h["x-forwarded-uri"] === "string" && h["x-forwarded-uri"]);
  if (fromHeader) {
    return fromHeader.startsWith("/") ? fromHeader : `/${fromHeader}`;
  }
  const raw = req.url || "/";
  if (raw === "/api/mock" || raw.startsWith("/api/mock?")) {
    return "/api/v1/";
  }
  return raw;
}

export function runMockOnVercel(req: IncomingMessage, res: ServerResponse): void {
  const url = requestUrl(req);
  (req as IncomingMessage & { url?: string }).url = url;
  mockMiddleware(req, res, () => {
    if (!res.headersSent) {
      res.statusCode = 404;
      res.end("Not found");
    }
  });
}
