import type { IncomingMessage, ServerResponse } from "http";
import type { VercelRequest } from "@vercel/node";
import { mockMiddleware } from "./router";

type ApiReq = IncomingMessage & { query?: VercelRequest["query"] };

/** Preserve path through Vercel rewrite → /api/mock. */
function requestUrl(req: ApiReq): string {
  const sub = req.query?.__sub;
  if (sub !== undefined) {
    const tail = typeof sub === "string" ? sub : Array.isArray(sub) ? sub.join("/") : "";
    const path = `/api/v1${tail ? `/${tail}` : ""}`;
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(req.query || {})) {
      if (k === "__sub") continue;
      if (Array.isArray(v)) v.forEach((x) => q.append(k, x));
      else if (v != null) q.set(k, String(v));
    }
    const qs = q.toString();
    return qs ? `${path}?${qs}` : path;
  }

  const h = req.headers;
  const fromHeader =
    (typeof h["x-vercel-original-url"] === "string" && h["x-vercel-original-url"]) ||
    (typeof h["x-invoke-path"] === "string" && h["x-invoke-path"]) ||
    (typeof h["x-forwarded-uri"] === "string" && h["x-forwarded-uri"]);
  if (fromHeader) {
    return fromHeader.startsWith("/") ? fromHeader : `/${fromHeader}`;
  }

  const raw = req.url || "/";
  if (raw.startsWith("/api/v1")) return raw;
  return raw;
}

export function runMockOnVercel(req: ApiReq, res: ServerResponse): void {
  (req as IncomingMessage & { url?: string }).url = requestUrl(req);
  mockMiddleware(req, res, () => {
    if (!res.headersSent) {
      res.statusCode = 404;
      res.end("Not found");
    }
  });
}
