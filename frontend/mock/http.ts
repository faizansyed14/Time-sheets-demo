import type { IncomingMessage, ServerResponse } from "http";
import { getStore, nextId, getPdf, publicUser, publicPortalUser } from "./store";
import { streamExtractionDemo, streamChatDemo } from "./sse";
import { MONTHS_LONG, currentPeriod, type PipelineSeed, type RecordSeed } from "./seed";

export type Res = ServerResponse;
export type Req = IncomingMessage & { url?: string };

export function parseUrl(req: Req) {
  const raw = req.url || "/";
  const q = raw.indexOf("?");
  const pathname = q >= 0 ? raw.slice(0, q) : raw;
  const search = q >= 0 ? raw.slice(q + 1) : "";
  return { pathname, query: new URLSearchParams(search) };
}

export function json(res: Res, status: number, body: unknown) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(data),
  });
  res.end(data);
}

export function sendPdf(res: Res, buf: Buffer, filename?: string) {
  sendBinary(res, buf, "application/pdf", filename);
}

export function sendBinary(res: Res, buf: Buffer, contentType: string, filename?: string) {
  const headers: Record<string, string | number> = {
    "Content-Type": contentType,
    "Content-Length": buf.length,
    "Cache-Control": "no-store",
  };
  if (filename) headers["Content-Disposition"] = `inline; filename="${filename}"`;
  res.writeHead(200, headers);
  res.end(buf);
}

export function readBody(req: Req): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

export async function readJson(req: Req): Promise<any> {
  const buf = await readBody(req);
  if (!buf.length) return {};
  try {
    return JSON.parse(buf.toString("utf8"));
  } catch {
    return {};
  }
}

export function parseMultipartFilenames(buf: Buffer, contentType: string | undefined): string[] {
  const names: string[] = [];
  if (!contentType || !contentType.includes("multipart")) return names;
  const m = /boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(contentType);
  const boundary = m?.[1] || m?.[2];
  if (!boundary) return names;
  const text = buf.toString("latin1");
  const re = /Content-Disposition:[^\n]*filename="([^"]+)"/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) names.push(match[1]);
  if (!names.length) names.push("file.pdf");
  return names;
}

export function getAuthToken(req: Req, query: URLSearchParams): string | null {
  const h = req.headers.authorization || "";
  if (h.toLowerCase().startsWith("bearer ")) return h.slice(7).trim();
  return query.get("token");
}

export function tokenOk(token: string | null): boolean {
  if (!token) return false;
  return token.startsWith("demo-") || token.startsWith("login-");
}

export function userFromToken(token: string | null) {
  const s = getStore();
  if (!token || !tokenOk(token)) return null;
  if (token.startsWith("demo-portal-")) {
    const uname = token.replace("demo-portal-", "");
    return s.portalUsers.find((u) => u.username === uname) || null;
  }
  if (token.startsWith("demo-")) {
    const uname = token.slice("demo-".length);
    return s.users.find((u) => u.username === uname) || null;
  }
  if (token.startsWith("login-")) {
    const uname = token.split("-")[1];
    return s.users.find((u) => u.username === uname) || null;
  }
  return s.users[0] || null;
}

export function portalUserFromToken(token: string | null) {
  const s = getStore();
  if (!token || !token.startsWith("demo-portal-")) return null;
  const uname = token.replace("demo-portal-", "");
  return s.portalUsers.find((u) => u.username === uname) || null;
}

export function requireAuth(req: Req, res: Res, query: URLSearchParams) {
  const token = getAuthToken(req, query);
  if (!tokenOk(token)) {
    json(res, 401, { detail: "Not authenticated" });
    return null;
  }
  return token;
}

/** Block viewer (read-only) from mutating demo data. */
export function requireWrite(req: Req, res: Res, query: URLSearchParams) {
  const token = requireAuth(req, res, query);
  if (!token) return null;
  const u = userFromToken(token);
  if (!u || ("role" in u && (u as any).role === "viewer")) {
    json(res, 403, { detail: "Read-only role cannot make changes" });
    return null;
  }
  return token;
}

export function pageItems<T>(items: T[], offset: number, limit: number) {
  const slice = items.slice(offset, offset + limit);
  return {
    items: slice,
    total: items.length,
    limit,
    offset,
    has_more: offset + limit < items.length,
  };
}

export function stripPipe(p: PipelineSeed) {
  const { pdfKey: _k, thread_key: _t, ...rest } = p as PipelineSeed & { pdfKey?: string };
  return rest;
}

export function recount(rec: RecordSeed) {
  rec.annual_leave_count = rec.annual_leave_dates.length;
  rec.remote_work_count = rec.remote_work_dates.length;
  rec.sick_leave_count = rec.sick_leave_dates.length;
  rec.maternity_leave_count = rec.maternity_leave_dates.length;
  rec.unpaid_leave_count = rec.unpaid_leave_dates.length;
  rec.absent_count = rec.absent_dates.length;
  rec.public_holiday_count = rec.public_holiday_dates.length;
  rec.other_leave_count = rec.other_leave_dates.length;
  rec.working_dates_count = rec.working_dates.length;
  rec.weekend_dates_count = rec.weekend_dates.length;
  return rec;
}

export function emlPreview(subject: string, from_: string) {
  return {
    subject,
    from_,
    to: "timesheets@demo.local",
    date: new Date().toUTCString(),
    body_text: "Demo email body",
    body_html: "<p>Demo email body<" + "/p>",
    attachments: [] as any[],
    warnings: [] as string[],
  };
}

export {
  getStore,
  nextId,
  getPdf,
  publicUser,
  publicPortalUser,
  streamExtractionDemo,
  streamChatDemo,
  MONTHS_LONG,
  currentPeriod,
};
export type { PipelineSeed, RecordSeed };
