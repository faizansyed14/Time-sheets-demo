import type { IncomingMessage, ServerResponse } from "http";
import {
  parseUrl, json, sendPdf, sendBinary, readBody, readJson, parseMultipartFilenames,
  getAuthToken, tokenOk, userFromToken, portalUserFromToken, requireAuth, requireWrite,
  pageItems, stripPipe, recount, emlPreview,
  getStore, nextId, getPdf, publicUser, publicPortalUser,
  streamExtractionDemo, streamChatDemo, MONTHS_LONG, currentPeriod,
  type Req, type Res, type PipelineSeed, type RecordSeed,
} from "./http";
import { stagedFromAttendance } from "./pdf";
import { resetStore, scheduleSave } from "./store";

function coverageSummary(year: number, month: number, q: string, location: string, status: string, onlyMissing: boolean, offset: number, limit: number) {
  const s = getStore();
  const rows = s.employees.filter((e) => e.active).map((emp) => {
    const recs = s.records.filter((r) => r.matched_employee_pk === emp.id);
    const focus = recs.find((r) => r.month === month && r.year === year) || null;
    const pipePending = s.pipeline.filter((p) => p.employee_id === emp.employee_id && p.month === month && p.year === year && p.status === "needs_review");
    const submitted = !!focus || pipePending.length > 0;
    const awaiting = pipePending.length > 0 && !focus;
    return {
      employee_pk: emp.id, employee_id: emp.employee_id, employee_name: emp.name,
      account_manager: emp.account_manager, dco_number: emp.dco_number, location: emp.location,
      status: (submitted ? "green" : "yellow") as "green" | "yellow",
      record_count: recs.length, needs_review_count: pipePending.length,
      pending_approval_count: recs.filter((r) => r.approval_status === "pending").length,
      years: [...new Set(recs.map((r) => r.year))],
      submitted_months: recs.filter((r) => r.year === year).map((r) => r.month),
      in_matcher: true, has_records: recs.length > 0,
      focus_record_id: focus?.id ?? null,
      focus_validation_status: focus?.validation_status ?? null,
      focus_approval_status: focus?.approval_status ?? null,
      awaiting_review_this_month: awaiting,
      _missing: !submitted, _awaiting: awaiting,
    };
  });
  let filtered = rows;
  if (q) {
    const qq = q.toLowerCase();
    filtered = filtered.filter((r) => (r.employee_name || "").toLowerCase().includes(qq) || (r.employee_id || "").toLowerCase().includes(qq) || (r.account_manager || "").toLowerCase().includes(qq));
  }
  if (location) filtered = filtered.filter((r) => r.location === location);
  if (onlyMissing) filtered = filtered.filter((r) => r._missing);
  if (status === "missing") filtered = filtered.filter((r) => r._missing);
  if (status === "submitted") filtered = filtered.filter((r) => !r._missing);
  if (status === "awaiting_review") filtered = filtered.filter((r) => r._awaiting);
  const total = filtered.length;
  const submitted_this_month = rows.filter((r) => !r._missing).length;
  const missing_this_month = rows.filter((r) => r._missing).length;
  const awaiting_review_this_month = rows.filter((r) => r._awaiting).length;
  const slice = filtered.slice(offset, offset + limit).map(({ _missing, _awaiting, ...rest }) => rest);
  return {
    year, month, total_employees: rows.length, submitted_this_month, missing_this_month, awaiting_review_this_month,
    submitted_pct: rows.length ? Math.round((submitted_this_month / rows.length) * 100) : 0,
    missing_pct: rows.length ? Math.round((missing_this_month / rows.length) * 100) : 0,
    awaiting_review_pct: rows.length ? Math.round((awaiting_review_this_month / rows.length) * 100) : 0,
    needs_review: s.pipeline.filter((p) => p.status === "needs_review").length,
    pending_approval: s.records.filter((r) => r.approval_status === "pending").length,
    missing_employees: rows.filter((r) => r._missing).map((r) => r.employee_name || ""),
    rows: slice, filtered_total: total, limit, offset, has_more: offset + limit < total,
  };
}

function pipelineStats(successWindowDays = 30) {
  const s = getStore();
  const cutoff = Date.now() - successWindowDays * 86400000;
  const by_failure_code: Record<string, number> = {};
  const failure_labels: Record<string, string> = {};
  for (const p of s.pipeline) {
    if (p.failure_code) {
      by_failure_code[p.failure_code] = (by_failure_code[p.failure_code] || 0) + 1;
      if (p.failure_label) failure_labels[p.failure_code] = p.failure_label;
    }
  }
  return {
    total: s.pipeline.length,
    processing: s.pipeline.filter((p) => p.status === "processing").length,
    success: s.pipeline.filter((p) => p.status === "success").length,
    success_recent: s.pipeline.filter((p) => p.status === "success" && p.updated_at && Date.parse(p.updated_at) >= cutoff).length,
    needs_review: s.pipeline.filter((p) => p.status === "needs_review").length,
    failed: s.pipeline.filter((p) => p.status === "failed").length,
    resolved: s.pipeline.filter((p) => p.status === "resolved").length,
    by_failure_code, failure_labels,
  };
}

function listThreads(q: string, status: string) {
  const s = getStore();
  const byConv = new Map<string, typeof s.emails>();
  for (const e of s.emails) {
    const key = e.conversation_id || e.id;
    if (!byConv.has(key)) byConv.set(key, []);
    byConv.get(key)!.push(e);
  }
  const threads = [...byConv.values()].map((msgs) => {
    const sorted = [...msgs].sort((a, b) => Date.parse(b.received_at || "") - Date.parse(a.received_at || ""));
    const newest = sorted[0];
    const withFiles = sorted.find((m) => m.attachments.length > 0) || newest;
    const anyExtracted = sorted.find((m) => m.extract_email_at) || newest;
    const { body_text, body_html, to_recipients, cc_recipients, inline_attachment_ids, summary, extracted_sheets, extracted_at, extracted_filenames, ...list } = newest as any;
    return {
      ...list,
      attachment_count: msgs.reduce((n, m) => n + (m.attachments?.length || 0), 0),
      has_approval_screenshot: msgs.some((m) => m.has_approval_screenshot),
      extract_email_at: anyExtracted.extract_email_at,
      no_sheets_found_at: sorted.find((m) => m.no_sheets_found_at)?.no_sheets_found_at ?? null,
      attachments: withFiles.attachments.map(({ pdfKey, ...a }: any) => a),
      thread_id: newest.thread_id || newest.conversation_id || newest.id,
      thread_message_count: msgs.length,
    };
  });
  let out = threads;
  if (status && status !== "all") out = out.filter((t) => t.status === status);
  if (q) {
    const qq = q.toLowerCase();
    out = out.filter((t) => (t.subject || "").toLowerCase().includes(qq) || (t.sender_name || "").toLowerCase().includes(qq) || (t.sender_email || "").toLowerCase().includes(qq));
  }
  out.sort((a, b) => Date.parse(b.received_at || "") - Date.parse(a.received_at || ""));
  return out;
}

/** Inbox UI + real backend address messages by provider_message_id (Graph id). */
function findEmail(msgId: string) {
  const s = getStore();
  return s.emails.find((e) => e.provider_message_id === msgId || e.id === msgId) || null;
}

function stagePipelineFromEmail(msgId: string): PipelineSeed[] {
  const s = getStore();
  const email = findEmail(msgId);
  if (!email) return [];
  const { month, year } = currentPeriod();
  const staged: PipelineSeed[] = [];
  const sheets = email.attachments.filter((a) => a.kind === "timesheet");
  for (const att of (sheets.length ? sheets : email.attachments.slice(0, 1))) {
    const emp = s.employees.find((e) => e.work_email === email.sender_email || e.employee_email_id === email.sender_email);
    const id = nextId("pipe");
    const item: PipelineSeed = {
      id, filename: att.filename, content_type: att.content_type, size_bytes: att.size ?? 2000,
      source_kind: "email", source_id: email.provider_message_id, attachment_id: att.attachment_id,
      status: "needs_review", stage: "staged",
      failure_code: emp ? null : "no_employee_match",
      failure_label: emp ? null : "Employee not matched",
      failure_detail: emp ? null : "Demo unmatched",
      events: [
        { stage: "ingest", status: "ok", detail: "OK", at: new Date().toISOString() },
        { stage: "extract", status: "ok", detail: "OK", at: new Date().toISOString() },
        { stage: "match", status: emp ? "ok" : "warn", detail: emp ? "Matched" : "Unmatched", at: new Date().toISOString() },
      ],
      employee_id: emp?.employee_id ?? null, employee_name: emp?.name ?? null,
      month, year, record_id: null, extraction_model: "demo-gpt", extraction_method: "vision",
      used_ocr: false, auto_accepted: !!emp, can_retry: true, can_resolve_assign: true,
      resolved_at: null, resolution_note: null,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      pdfKey: att.pdfKey || "generic", thread_key: email.conversation_id,
      extraction_meta: {
        staged: stagedFromAttendance(
          year, month,
          emp ? { id: emp.id, name: emp.name, employee_id: emp.employee_id } : null,
          { annualLeave: [3, 4], remoteWork: [8, 9], sickLeave: [] },
        ),
      },
    };
    s.pipeline.unshift(item);
    staged.push(item);
  }
  email.extract_email_at = new Date().toISOString();
  email.extracted_at = email.extract_email_at;
  email.extracted_sheets = sheets.map((a) => a.filename);
  email.extracted_filenames = email.extracted_sheets;
  return staged;
}

function vaultManagers() {
  const s = getStore();
  const map = new Map<string, Set<string>>();
  for (const f of s.vaultFiles) {
    const [mgr, emp] = f.rel_path.split("/");
    if (!map.has(mgr)) map.set(mgr, new Set());
    map.get(mgr)!.add(emp);
  }
  for (const e of s.employees) {
    if (!e.account_manager) continue;
    if (!map.has(e.account_manager)) map.set(e.account_manager, new Set());
    map.get(e.account_manager)!.add(e.name);
  }
  return [...map.entries()].map(([name, emps]) => ({ name, rel_path: name, employee_count: emps.size }));
}

function decodePath(s: string) { try { return decodeURIComponent(s); } catch { return s; } }

export function mockMiddleware(req: IncomingMessage, res: ServerResponse, next: () => void): void {
  const r = req as Req;
  const { pathname, query } = parseUrl(r);
  const method = (r.method || "GET").toUpperCase();

  if (pathname === "/health") {
    json(res, 200, { status: "ok", email_provider: "demo", extraction_engine: "demo" });
    return;
  }

  if (!pathname.startsWith("/api/v1")) {
    next();
    return;
  }

  void handleApi(r, res, method, pathname, query)
    .then(() => {
      if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
        scheduleSave();
      }
    })
    .catch((err) => {
      console.error("[mock-api]", err);
      if (!res.headersSent) json(res, 500, { detail: String(err) });
    });
}

async function handleApi(req: Req, res: Res, method: string, pathname: string, query: URLSearchParams) {
  const path = pathname.replace(/^\/api\/v1/, "") || "/";
  const s = getStore();
  const parts = path.split("/").filter(Boolean);

  // ---- Demo utilities ----
  if (parts[0] === "demo" && parts[1] === "reset" && method === "POST") {
    resetStore();
    return json(res, 200, { ok: true, message: "Demo data reset to seed defaults" });
  }

  const mutating = method !== "GET" && method !== "HEAD" && method !== "OPTIONS";
  const skipWriteGate =
    parts[0] === "auth" ||
    (parts[0] === "portal" && parts[1] === "auth") ||
    parts[0] === "portal";
  if (mutating && !skipWriteGate) {
    if (!requireWrite(req, res, query)) return;
  }

  // ---- Auth ----
  if (parts[0] === "auth") {
    if (parts[1] === "login" && method === "POST") {
      const body = await readJson(req);
      // Ensure all demo roles exist (covers hot-reload without full restart).
      const demoUsers: { username: string; password: string; role: "admin" | "user" | "viewer" | "vault_matcher"; email: string }[] = [
        { username: "admin", password: "admin", role: "admin", email: "admin@demo.local" },
        { username: "user", password: "user", role: "user", email: "user@demo.local" },
        { username: "viewer", password: "viewer", role: "viewer", email: "viewer@demo.local" },
        { username: "vault", password: "vault", role: "vault_matcher", email: "vault@demo.local" },
      ];
      for (const d of demoUsers) {
        if (!s.users.some((x) => x.username === d.username)) {
          s.users.push({
            id: `user-${d.username}`, username: d.username, password: d.password, email: d.email,
            role: d.role, auth_mode: "captcha", is_active: true,
            last_login_at: null, last_seen_at: null, online: false,
          });
        }
      }
      const aliases: Record<string, string[]> = {
        admin: ["admin", "admin123"],
        user: ["user", "user123"],
        viewer: ["viewer", "viewer123"],
        vault: ["vault", "vault123"],
      };
      const u = s.users.find((x) => {
        if (x.username !== body.username) return false;
        const ok = aliases[x.username] || [x.password];
        return ok.includes(body.password) || x.password === body.password;
      });
      if (!u) return json(res, 401, { detail: "Invalid credentials" });
      u.last_login_at = new Date().toISOString();
      const token = `demo-${u.username}`;
      return json(res, 200, { status: "authenticated", access_token: token, user: publicUser(u) });
    }
    if (parts[1] === "me" && method === "GET") {
      const token = requireAuth(req, res, query); if (!token) return;
      const u = userFromToken(token);
      if (!u || !("role" in u) || (u as any).role === "employee") return json(res, 401, { detail: "Not authenticated" });
      return json(res, 200, publicUser(u as any));
    }
    if (parts[1] === "logout" && method === "POST") return json(res, 200, { ok: true });
    if (parts[1] === "captcha" && method === "GET") {
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="40"><rect width="120" height="40" fill="#eef2ff"/><text x="20" y="28" font-size="20" font-family="monospace" fill="#334155">123456</text></svg>';
      res.writeHead(200, { "Content-Type": "image/svg+xml", "X-Captcha-Id": "demo-captcha" });
      return res.end(svg);
    }
    if ((parts[1] === "verify-otp" || parts[1] === "verify-totp" || parts[1] === "verify-captcha") && method === "POST") {
      const body = await readJson(req);
      const code = body.code || body.answer || "";
      if (code && code !== "123456") return json(res, 401, { detail: "Invalid code" });
      const login = String(body.login_token || "login-admin");
      const uname = login.replace(/^login-/, "") || "admin";
      const u = s.users.find((x) => x.username === uname) || s.users[0];
      const token = `demo-${u.username}`;
      return json(res, 200, { status: "authenticated", access_token: token, user: publicUser(u) });
    }
    if (parts[1] === "resend-otp" && method === "POST") {
      return json(res, 200, { status: "otp_required", login_token: "login-admin", message: "OTP resent (demo: 123456)", debug_otp: "123456" });
    }
  }

  // ---- Portal auth (separate namespace) ----
  if (parts[0] === "portal" && parts[1] === "auth") {
    if (parts[2] === "login" && method === "POST") {
      const body = await readJson(req);
      const u = s.portalUsers.find((x) => x.username === body.username && x.password === body.password);
      if (!u) return json(res, 401, { detail: "Invalid credentials" });
      u.last_login_at = new Date().toISOString();
      return json(res, 200, { access_token: "demo-portal-" + u.username, user: publicPortalUser(u) });
    }
    if (parts[2] === "me" && method === "GET") {
      const token = getAuthToken(req, query);
      const u = portalUserFromToken(token);
      if (!u) return json(res, 401, { detail: "Not authenticated" });
      return json(res, 200, publicPortalUser(u));
    }
    if (parts[2] === "logout" && method === "POST") return json(res, 200, { ok: true });
  }

  // Portal employee submissions
  if (parts[0] === "portal" && parts[1] === "employee" && parts[2] === "submissions") {
    const token = getAuthToken(req, query);
    const pu = portalUserFromToken(token);
    if (!pu) return json(res, 401, { detail: "Not authenticated" });
    const mine = () => s.portalSubmissions.filter((x) => x.employee_pk === pu.employee_pk);

    if (parts.length === 3 && method === "GET") return json(res, 200, mine());
    if (parts.length === 3 && method === "POST") {
      const body = await readJson(req);
      let sub = s.portalSubmissions.find((x) => x.employee_pk === pu.employee_pk && x.month === body.month && x.year === body.year && x.status === "draft");
      if (!sub) {
        sub = {
          id: nextId("psub"), employee_pk: pu.employee_pk!, employee_name: pu.employee_name, employee_id: pu.employee_id,
          month: body.month, year: body.year, status: "draft", manager_decision: "pending", manager_note: null, decided_at: null,
          approval_claimed: false, employee_note: body.employee_note || null, extraction_state: "not_started", extraction_error: null,
          review_state: null, record_id: null, submitted_at: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
          files: [], pipeline_files: [],
        };
        s.portalSubmissions.push(sub);
      } else if (body.employee_note !== undefined) {
        sub.employee_note = body.employee_note;
        sub.updated_at = new Date().toISOString();
      }
      return json(res, 200, sub);
    }
    if (parts.length === 5 && method === "GET") {
      const month = Number(parts[3]); const year = Number(parts[4]);
      const submission = mine().find((x) => x.month === month && x.year === year) || null;
      const filed = s.records.some((r) => r.matched_employee_pk === pu.employee_pk && r.month === month && r.year === year);
      return json(res, 200, { submission, already_filed_elsewhere: filed, filed_source_note: filed ? "Filed via email pipeline" : null });
    }
    if (parts.length === 4 && method === "DELETE") {
      const idx = s.portalSubmissions.findIndex((x) => x.id === parts[3] && x.status === "draft");
      if (idx >= 0) s.portalSubmissions.splice(idx, 1);
      return json(res, 200, { ok: true });
    }
    if (parts.length === 5 && parts[4] === "submit" && method === "POST") {
      const body = await readJson(req);
      const sub = s.portalSubmissions.find((x) => x.id === parts[3]);
      if (!sub) return json(res, 404, { detail: "Not found" });
      if (body.approval_claimed === undefined) return json(res, 422, { detail: "approval_claimed required" });
      sub.approval_claimed = !!body.approval_claimed;
      sub.status = "submitted";
      sub.submitted_at = new Date().toISOString();
      sub.extraction_state = "done";
      sub.updated_at = sub.submitted_at;
      const pipeId = nextId("pipe");
      s.pipeline.unshift({
        id: pipeId, filename: sub.files[0]?.filename || "portal.pdf", content_type: "application/pdf", size_bytes: 4000,
        source_kind: "portal", source_id: sub.id, attachment_id: null, status: "needs_review", stage: "staged",
        failure_code: null, failure_label: null, failure_detail: null,
        events: [{ stage: "portal", status: "ok", detail: "Submitted", at: sub.submitted_at }],
        employee_id: sub.employee_id, employee_name: sub.employee_name, month: sub.month, year: sub.year,
        record_id: null, extraction_model: "demo-gpt", extraction_method: "vision", used_ocr: false,
        extraction_meta: { staged: { employee_pk: sub.employee_pk, matched_name: sub.employee_name, matched_employee_id: sub.employee_id, month: sub.month, year: sub.year, buckets: {} } },
        auto_accepted: true, can_retry: true, can_resolve_assign: true, resolved_at: null, resolution_note: null,
        created_at: sub.submitted_at, updated_at: sub.submitted_at, pdfKey: sub.files[0]?.pdfKey || "generic",
      });
      sub.pipeline_files = [{ kind: "timesheet", pipeline_file_id: pipeId, pipeline_status: "needs_review", record_id: null }];
      return json(res, 200, sub);
    }
    if (parts.length >= 5 && parts[4] === "files") {
      const sub = s.portalSubmissions.find((x) => x.id === parts[3]);
      if (!sub) return json(res, 404, { detail: "Not found" });
      if (parts.length === 5 && method === "POST") {
        const kind = (query.get("kind") || "timesheet") as any;
        await readBody(req);
        const f = { id: nextId("psfile"), kind, filename: "upload.pdf", content_type: "application/pdf", size_bytes: 3000, created_at: new Date().toISOString(), pdfKey: "generic" };
        sub.files = sub.files.filter((x) => x.kind !== kind);
        sub.files.push(f);
        sub.updated_at = new Date().toISOString();
        return json(res, 200, sub);
      }
      if (parts.length === 6 && method === "DELETE") {
        sub.files = sub.files.filter((x) => x.kind !== parts[5]);
        return json(res, 200, sub);
      }
      if (parts.length === 7 && (parts[6] === "content" || parts[6] === "render") && method === "GET") {
        const f = sub.files.find((x) => x.kind === parts[5]);
        return sendPdf(res, getPdf(f?.pdfKey), f?.filename || "file.pdf");
      }
    }
  }

  // Most internal routes need auth (except already handled)
  const openAuth = path.startsWith("/auth/") || path.startsWith("/portal/auth/");
  if (!openAuth && parts[0] !== "portal") {
    // allow captcha without auth already handled
  }

  // For remaining /api/v1 routes (non-portal), require internal auth
  const isPortalRoute = parts[0] === "portal";
  if (!isPortalRoute && !(parts[0] === "auth")) {
    const token = requireAuth(req, res, query);
    if (!token) return;
    // reject pure portal tokens on internal routes
    if (token.startsWith("demo-portal-")) return json(res, 401, { detail: "Portal token not valid here" });
  }

  // ---- Notice ----
  if (parts[0] === "notice") {
    if (method === "GET") return json(res, 200, s.systemNotice);
    if (method === "PUT") {
      const body = await readJson(req);
      Object.assign(s.systemNotice, body, { updated_at: new Date().toISOString(), updated_by: "admin" });
      return json(res, 200, s.systemNotice);
    }
  }

  // ---- System health ----
  if (parts[0] === "system-health") {
    if (parts[1] === "check-now" && method === "POST") return json(res, 200, { ok: true, rows: s.systemHealth });
    if (method === "GET") return json(res, 200, s.systemHealth);
  }

  // ---- Agentic chat ----
  if (parts[0] === "agentic-chat") {
    if (parts[1] === "suggestions" && method === "GET") return json(res, 200, { enabled: true, model: "demo-gpt" });
    if (parts[1] === "access" && method === "GET") return json(res, 200, s.chatAccess);
    if (parts[1] === "access" && method === "PUT") {
      const body = await readJson(req);
      s.chatAccess.enabled_for_others = !!body.enabled_for_others;
      s.chatAccess.updated_at = new Date().toISOString();
      s.chatAccess.updated_by = "admin";
      return json(res, 200, s.chatAccess);
    }
    if (parts[1] === "stream" && method === "POST") {
      const buf = await readBody(req);
      let userText = "hello";
      try {
        const ct = String(req.headers["content-type"] || "");
        if (ct.includes("multipart")) {
          const text = buf.toString("utf8");
          const m = /name="messages"[\r\n]+([\s\S]*?)(?:\r?\n--)/.exec(text);
          if (m) {
            const msgs = JSON.parse(m[1].trim());
            userText = msgs.filter((x: any) => x.role === "user").pop()?.content || userText;
          }
        } else {
          const body = JSON.parse(buf.toString("utf8") || "{}");
          userText = body.messages?.filter((x: any) => x.role === "user").pop()?.content || userText;
        }
      } catch { /* ignore */ }
      await streamChatDemo(res, userText);
      return;
    }
  }

  // ---- Inbox ----
  if (parts[0] === "inbox") {
    if (parts[1] === "threads" && method === "GET") {
      const items = listThreads(query.get("q") || "", query.get("status") || "");
      return json(res, 200, pageItems(items, Number(query.get("offset") || 0), Number(query.get("limit") || 200)));
    }
    if (parts[1] === "auto-extract") {
      if (parts[2] === "status" && method === "GET") return json(res, 200, s.autoExtract);
      if (parts[2] === "coverage" && method === "GET") {
        const threads = listThreads("", "");
        const extracted = threads.filter((t: any) => s.emails.some((e) => (e.conversation_id || e.id) === (t.conversation_id || t.id) && e.extracted_at)).length;
        return json(res, 200, { extracted_threads: extracted, total_threads: threads.length });
      }
      if (parts[2] === "start" && method === "POST") {
        s.autoExtract = { ...s.autoExtract, state: "completed", enabled: true, total: 3, processed: 3, succeeded: 2, failed: 0, skipped: 1, started_at: new Date().toISOString(), finished_at: new Date().toISOString() };
        return json(res, 200, s.autoExtract);
      }
      if (parts[2] === "stop" && method === "POST") {
        s.autoExtract = { ...s.autoExtract, state: "idle", enabled: false };
        return json(res, 200, s.autoExtract);
      }
    }
    if (parts.length >= 2) {
      const msgId = decodePath(parts[1]);
      const email = findEmail(msgId);
      if (parts[2] === "thread" && method === "GET") {
        if (!email) return json(res, 404, { detail: "Not found" });
        const key = email.conversation_id || email.provider_message_id;
        const messages = s.emails
          .filter((e) => (e.conversation_id || e.provider_message_id) === key)
          .sort((a, b) => Date.parse(a.received_at || "") - Date.parse(b.received_at || ""))
          .map((e) => ({ ...e, attachments: e.attachments.map(({ pdfKey, ...a }) => a) }));
        const root = messages[0];
        const summaryOwner = [...messages].reverse().find((m: any) => m.summary) || email;
        return json(res, 200, {
          thread_id: root.thread_id || root.conversation_id || root.id,
          messages,
          summary: (summaryOwner as any).summary || null,
          extracted_sheets: (email as any).extracted_sheets || [],
          extracted_at: (email as any).extracted_at || null,
        });
      }
      if (parts.length === 2 && method === "GET") {
        if (!email) return json(res, 404, { detail: "Not found" });
        return json(res, 200, { ...email, attachments: email.attachments.map(({ pdfKey, ...a }) => a) });
      }
      if (parts[2] === "decision" && method === "POST") {
        const body = await readJson(req);
        if (!email) return json(res, 404, { detail: "Not found" });
        email.status = body.accepted ? "ingested" : "archived";
        return json(res, 200, { ok: true, status: email.status });
      }
      if (parts[2] === "restore" && method === "POST") {
        if (!email) return json(res, 404, { detail: "Not found" });
        email.status = "new";
        return json(res, 200, { ok: true });
      }
      if (parts[2] === "llm-preview" && method === "GET") {
        return json(res, 200, {
          flow: "extract-full", model: "demo-gpt", pii_redaction: true, scope: "thread",
          steps: [{ n: 1, title: "Pass 1 classify", detail: "Demo", items: ["timesheet.pdf"] }],
          thread_messages: [email?.subject || ""], warnings: [], subject_sent: email?.subject || "",
          body_sent: email?.body_text || "", files_sent: [], images_sent: [], not_sent: [],
          formats_detected: ["pdf"], system_prompt: "demo", user_prompt: "demo",
          call_count: { inference: 2, file_uploads: 0, file_deletes: 0 }, redacted: [], not_redacted: [], policy: "demo",
        });
      }
      if (parts[2] === "extract-full" && parts[3] === "stream" && method === "POST") {
        const staged = stagePipelineFromEmail(msgId).map(stripPipe);
        await streamExtractionDemo(res, { staged, groups: staged.length, message: "Demo extraction complete" });
        return;
      }
      if (parts[2] === "attachments" && parts[3]) {
        const attId = decodePath(parts[3]);
        let att = email?.attachments.find((a) => a.attachment_id === attId);
        let attEmail = email;
        if (!att && email) {
          const key = email.conversation_id || email.provider_message_id;
          for (const m of s.emails.filter((e) => (e.conversation_id || e.provider_message_id) === key)) {
            const hit = m.attachments.find((a) => a.attachment_id === attId);
            if (hit) { att = hit; attEmail = m; break; }
          }
        }
        if (parts[4] === "eml-preview" && method === "GET") return json(res, 200, emlPreview(attEmail?.subject || "", attEmail?.sender_email || ""));
        if ((parts[4] === "render" || !parts[4]) && method === "GET") {
          if (!att) return json(res, 404, { detail: "Attachment not found" });
          const buf = getPdf(att.pdfKey);
          const ct = att.content_type || "application/pdf";
          return sendBinary(res, buf, ct, att.filename || "attachment.pdf");
        }
      }
      if (parts[2] === "as-eml") {
        if (parts[3] === "preview" && method === "GET") return json(res, 200, emlPreview(email?.subject || "Email", email?.sender_email || ""));
        if (parts[3] === "save-to-vault" && method === "POST") {
          const body = await readJson(req);
          const rel = `${body.manager}/${body.employee}/${MONTHS_LONG[body.month]} ${body.year}/thread.eml`;
          s.vaultFiles.push({ name: "thread.eml", rel_path: rel, size: 1200, content_type: "message/rfc822", stored_at: new Date().toISOString(), pdfKey: "generic" });
          return json(res, 200, { saved: true, path: rel, filename: "thread.eml", employee_folder: body.employee });
        }
        if (method === "GET") {
          res.writeHead(200, { "Content-Type": "message/rfc822" });
          return res.end("From: demo@local\nSubject: " + (email?.subject || "demo") + "\n\nDemo EML");
        }
      }
    }
  }

  // continue marker
  return handleApiRest(req, res, method, path, parts, query, s);
}


async function handleApiRest(req: Req, res: Res, method: string, path: string, parts: string[], query: URLSearchParams, s: ReturnType<typeof getStore>) {
  const decode = decodePath;

  // ---- Pipeline ----
  if (parts[0] === "pipeline") {
    if (parts[1] === "stats" && method === "GET") {
      return json(res, 200, pipelineStats(Number(query.get("success_window_days") || 30)));
    }
    if (parts[1] === "rematch-unmatched" && method === "POST") {
      const unmatched = s.pipeline.filter((p) => p.status === "needs_review" && !p.employee_id);
      const rematched: any[] = [];
      const still: any[] = [];
      for (const p of unmatched) {
        still.push({ id: p.id, filename: p.filename, name: p.employee_name, month: p.month, year: p.year });
      }
      return json(res, 200, { checked: unmatched.length, rematched_count: rematched.length, rematched, still_unmatched_count: still.length, still_unmatched: still });
    }
    if (parts[1] === "portal-submissions") {
      if (parts.length === 2 && method === "GET") {
        let rows = s.portalSubmissions.filter((x) => x.status === "submitted" || x.status === "rejected");
        const md = query.get("manager_decision");
        if (md) rows = rows.filter((x) => x.manager_decision === md);
        if (query.get("month")) rows = rows.filter((x) => x.month === Number(query.get("month")));
        if (query.get("year")) rows = rows.filter((x) => x.year === Number(query.get("year")));
        return json(res, 200, rows);
      }
      if (parts.length === 3 && method === "GET") {
        const row = s.portalSubmissions.find((x) => x.id === parts[2]);
        if (!row) return json(res, 404, { detail: "Not found" });
        return json(res, 200, row);
      }
      if (parts[3] === "send-back" && method === "POST") {
        const body = await readJson(req);
        const row = s.portalSubmissions.find((x) => x.id === parts[2]);
        if (!row) return json(res, 404, { detail: "Not found" });
        row.manager_decision = "not_approved";
        row.manager_note = body.note || "";
        row.decided_at = new Date().toISOString();
        row.status = "rejected";
        row.updated_at = row.decided_at;
        return json(res, 200, row);
      }
      if (parts[3] === "files" && parts[5] && method === "GET") {
        const row = s.portalSubmissions.find((x) => x.id === parts[2]);
        const f = row?.files.find((x) => x.kind === parts[4]);
        return sendPdf(res, getPdf(f?.pdfKey), f?.filename || "file.pdf");
      }
    }
    if (parts[1] === "portal-roster" && method === "GET") {
      const month = Number(query.get("month")); const year = Number(query.get("year"));
      const rows = s.employees.map((e) => {
        const has = s.portalUsers.some((p) => p.employee_pk === e.id);
        const submission = s.portalSubmissions.find((x) => x.employee_pk === e.id && x.month === month && x.year === year) || null;
        return { employee_pk: e.id, employee_id: e.employee_id, employee_name: e.name, has_portal_account: has, submission };
      });
      return json(res, 200, rows);
    }
    if ((!parts[1] || parts.length === 1) && method === "GET") {
      let items = [...s.pipeline];
      const status = query.get("status");
      const exclude = query.get("exclude_status");
      if (status) items = items.filter((p) => p.status === status);
      if (exclude) items = items.filter((p) => p.status !== exclude);
      if (query.get("failure_code")) items = items.filter((p) => p.failure_code === query.get("failure_code"));
      if (query.get("source_kind")) items = items.filter((p) => p.source_kind === query.get("source_kind"));
      if (query.get("source_id")) items = items.filter((p) => p.source_id === query.get("source_id"));
      if (query.get("thread_key")) items = items.filter((p) => p.thread_key === query.get("thread_key"));
      if (query.get("auto_accepted") != null) {
        const aa = query.get("auto_accepted") === "true";
        items = items.filter((p) => p.auto_accepted === aa);
      }
      if (query.get("month")) items = items.filter((p) => p.month === Number(query.get("month")));
      if (query.get("year")) items = items.filter((p) => p.year === Number(query.get("year")));
      if (query.get("updated_after")) {
        const t = Date.parse(query.get("updated_after")!);
        items = items.filter((p) => p.updated_at && Date.parse(p.updated_at) >= t);
      }
      if (query.get("q")) {
        const qq = query.get("q")!.toLowerCase();
        items = items.filter((p) => (p.filename || "").toLowerCase().includes(qq) || (p.employee_name || "").toLowerCase().includes(qq));
      }
      items.sort((a, b) => Date.parse(b.updated_at || "") - Date.parse(a.updated_at || ""));
      const page = pageItems(items.map(stripPipe), Number(query.get("offset") || 0), Number(query.get("limit") || 200));
      return json(res, 200, page);
    }
    if (parts[1] && parts[2] === "retry" && method === "POST") {
      const p = s.pipeline.find((x) => x.id === parts[1]);
      if (!p) return json(res, 404, { detail: "Not found" });
      p.status = "needs_review"; p.stage = "staged"; p.failure_code = null; p.failure_label = null; p.failure_detail = null;
      p.updated_at = new Date().toISOString();
      p.events.push({ stage: "retry", status: "ok", detail: "Retried (demo)", at: p.updated_at });
      return json(res, 200, stripPipe(p));
    }
    if (parts[1] && parts[2] === "manual-fix" && method === "POST") {
      const buf = await readBody(req);
      const p = s.pipeline.find((x) => x.id === parts[1]);
      if (!p) return json(res, 404, { detail: "Not found" });
      // naive multipart field scrape
      const text = buf.toString("utf8");
      const get = (name: string) => {
        const m = new RegExp('name="' + name + '"[\\r\\n]+([\\s\\S]*?)(?:\\r?\\n--)').exec(text);
        return m ? m[1].trim() : "";
      };
      const empPk = get("employee_pk");
      const emp = s.employees.find((e) => e.id === empPk);
      const month = Number(get("month") || p.month); const year = Number(get("year") || p.year);
      let buckets: any = {};
      try { buckets = JSON.parse(get("buckets") || "{}"); } catch { buckets = {}; }
      const recId = nextId("rec");
      const rec: RecordSeed = {
        id: recId, matched_employee_pk: emp?.id ?? null, employee_id: emp?.employee_id ?? null, employee_name: emp?.name ?? null,
        account_manager: emp?.account_manager ?? null, dco_number: emp?.dco_number ?? null, match_note: "Manual fix",
        month, year, calendar_days: 30,
        annual_leave_dates: buckets.annual_leave || [], remote_work_dates: buckets.remote_work || [], sick_leave_dates: buckets.sick_leave || [],
        maternity_leave_dates: buckets.maternity_leave || [], unpaid_leave_dates: buckets.unpaid_leave || [], absent_dates: buckets.absent || [],
        public_holiday_dates: buckets.public_holiday || [], other_leave_dates: buckets.other_leave || [],
        working_dates: buckets.working || [], weekend_dates: buckets.weekend || [],
        annual_leave_count: 0, remote_work_count: 0, sick_leave_count: 0, maternity_leave_count: 0, unpaid_leave_count: 0,
        absent_count: 0, public_holiday_count: 0, other_leave_count: 0, working_dates_count: 0, weekend_dates_count: 0,
        validation_status: "manual_review", llm_summary: "Manual entry", hr_flags: [], approval_detected: false,
        approval_detail: get("approval_detail") || null, approval_status: (get("approval_status") as any) || "pending",
        source_email_id: p.source_id, storage_folder: emp ? emp.account_manager + "/" + emp.name : null,
        source_files: [], source_file_count: 0,
      };
      recount(rec);
      s.records.push(rec);
      p.status = "success"; p.stage = "filed"; p.record_id = recId; p.updated_at = new Date().toISOString();
      p.employee_id = emp?.employee_id ?? p.employee_id; p.employee_name = emp?.name ?? p.employee_name;
      p.month = month; p.year = year;
      return json(res, 200, stripPipe(p));
    }
    if (parts[1] && (parts[2] === "raw-preview" || parts[2] === "raw-render") && method === "GET") {
      const p = s.pipeline.find((x) => x.id === parts[1]);
      return sendPdf(res, getPdf(p?.pdfKey), p?.filename || "raw.pdf");
    }
    if (parts[1] && parts[2] === "raw-eml-preview" && method === "GET") {
      return json(res, 200, emlPreview("Pipeline raw", "pipeline@demo.local"));
    }
    if (parts[1] && method === "DELETE") {
      const idx = s.pipeline.findIndex((x) => x.id === parts[1]);
      if (idx >= 0) s.pipeline.splice(idx, 1);
      return json(res, 200, { ok: true });
    }
  }

  // ---- Employees / coverage ----
  if (parts[0] === "employees") {
    if (parts[1] === "coverage" && method === "GET") {
      const { month, year } = currentPeriod();
      return json(res, 200, coverageSummary(
        Number(query.get("year") || year), Number(query.get("month") || month),
        query.get("q") || "", query.get("location") || "", query.get("status") || "",
        query.get("only_missing") === "true", Number(query.get("offset") || 0), Number(query.get("limit") || 200),
      ));
    }
    if (parts[2] === "records" && method === "GET") {
      const pk = decode(parts[1]);
      let recs = s.records.filter((r) => r.matched_employee_pk === pk);
      if (query.get("year")) recs = recs.filter((r) => r.year === Number(query.get("year")));
      return json(res, 200, recs);
    }
  }

  // ---- Timesheets ----
  if (parts[0] === "timesheets") {
    if (parts[1] === "by-period" && method === "GET") {
      const month = Number(query.get("month")); const year = Number(query.get("year"));
      const rows = s.employees.map((emp) => {
        const rec = s.records.find((r) => r.matched_employee_pk === emp.id && r.month === month && r.year === year);
        const pipe = s.pipeline.find((p) => p.employee_id === emp.employee_id && p.month === month && p.year === year);
        const has = !!rec;
        const status = has ? "Received & Stored" : pipe ? "Received & Not Stored" : "Not Received";
        const base = rec || {
          id: "", matched_employee_pk: emp.id, employee_id: emp.employee_id, employee_name: emp.name,
          account_manager: emp.account_manager, dco_number: emp.dco_number, match_note: null,
          month, year, calendar_days: null,
          annual_leave_dates: [], remote_work_dates: [], sick_leave_dates: [], maternity_leave_dates: [],
          unpaid_leave_dates: [], absent_dates: [], public_holiday_dates: [], other_leave_dates: [],
          working_dates: [], weekend_dates: [],
          annual_leave_count: 0, remote_work_count: 0, sick_leave_count: 0, maternity_leave_count: 0,
          unpaid_leave_count: 0, absent_count: 0, public_holiday_count: 0, other_leave_count: 0,
          working_dates_count: 0, weekend_dates_count: 0, validation_status: "" as any, llm_summary: null,
          hr_flags: [], approval_detected: false, approval_detail: null, approval_status: "" as any,
          source_email_id: null, storage_folder: null, source_files: [], source_file_count: 0,
        };
        return {
          ...base,
          validation_status: rec?.validation_status ?? "",
          approval_status: rec?.approval_status ?? "",
          location: emp.location, project: emp.project, personal_email: emp.personal_email,
          work_email: emp.work_email, contact_no: emp.contact_no, has_record: has, status,
          received_at: pipe?.created_at ? pipe.created_at.slice(0, 16).replace("T", " ") : null,
          stored_at: rec ? (pipe?.updated_at || rec.source_files[0]?.ingested_at || "").toString().slice(0, 16).replace("T", " ") || null : null,
        };
      });
      return json(res, 200, rows);
    }
    if (parts[1] === "export" && method === "GET") {
      const csv = "employee_id,employee_name,month,year,status\nE1001,Aisha Rahman," + (query.get("month") || "") + "," + (query.get("year") || "") + ",demo\n";
      res.writeHead(200, { "Content-Type": "text/csv", "Content-Disposition": "attachment; filename=export.csv" });
      return res.end(csv);
    }
    if (parts[1] && parts[2] === "approve" && method === "POST") {
      const body = await readJson(req);
      const rec = s.records.find((r) => r.id === parts[1]);
      if (!rec) return json(res, 404, { detail: "Not found" });
      rec.approval_status = body.approved ? "approved" : "not_approved";
      rec.approval_detected = !!body.approved;
      return json(res, 200, rec);
    }
    if (parts[1] && parts[2] === "verify" && method === "POST") {
      const rec = s.records.find((r) => r.id === parts[1]);
      if (!rec) return json(res, 404, { detail: "Not found" });
      rec.validation_status = "verified";
      return json(res, 200, rec);
    }
    if (parts[1] && parts[2] === "sources" && method === "GET") {
      const rec = s.records.find((r) => r.id === parts[1]);
      if (!rec) return json(res, 404, { detail: "Not found" });
      return json(res, 200, (rec.source_files || []).map((f) => ({
        name: f.filename || "file.pdf", rel_path: f.key || "", content_type: "application/pdf", size: 4000,
      })));
    }
    if (parts[1] && method === "GET") {
      const rec = s.records.find((r) => r.id === parts[1]);
      if (!rec) return json(res, 404, { detail: "Not found" });
      return json(res, 200, rec);
    }
    if (parts[1] && method === "PATCH") {
      const body = await readJson(req);
      const rec = s.records.find((r) => r.id === parts[1]);
      if (!rec) return json(res, 404, { detail: "Not found" });
      Object.assign(rec, body);
      recount(rec);
      return json(res, 200, rec);
    }
    if (parts[1] && method === "DELETE") {
      const idx = s.records.findIndex((r) => r.id === parts[1]);
      if (idx >= 0) s.records.splice(idx, 1);
      return json(res, 200, { ok: true });
    }
  }

  // ---- Files / vault ----
  if (parts[0] === "files") {
    if (parts[1] === "managers" && method === "GET" && parts.length === 2) return json(res, 200, vaultManagers());
    if (parts[1] === "managers" && method === "POST" && parts.length === 2) {
      const body = await readJson(req);
      return json(res, 200, { name: body.name, rel_path: body.name, employee_count: 0 });
    }
    if (parts[1] === "managers" && parts[3] === "employees" && method === "GET" && parts.length === 4) {
      const mgr = decode(parts[2]);
      const emps = new Map<string, number>();
      for (const f of s.vaultFiles) {
        const [m, e, mo] = f.rel_path.split("/");
        if (m === mgr) emps.set(e, (emps.get(e) || 0));
      }
      for (const e of s.employees.filter((x) => x.account_manager === mgr)) {
        if (!emps.has(e.name)) emps.set(e.name, 0);
      }
      // count months
      const result = [...emps.keys()].map((name) => {
        const months = new Set(s.vaultFiles.filter((f) => f.rel_path.startsWith(mgr + "/" + name + "/")).map((f) => f.rel_path.split("/")[2]));
        return { name, rel_path: mgr + "/" + name, month_count: months.size || 0 };
      });
      return json(res, 200, result);
    }
    if (parts[1] === "managers" && parts[3] === "employees" && method === "POST" && parts.length === 4) {
      const body = await readJson(req);
      return json(res, 200, { name: body.name, rel_path: decode(parts[2]) + "/" + body.name, month_count: 0 });
    }
    if (parts[1] === "managers" && parts[5] === "months" && method === "GET" && parts.length === 6) {
      const mgr = decode(parts[2]); const emp = decode(parts[4]);
      const months = new Map<string, number>();
      for (const f of s.vaultFiles) {
        const segs = f.rel_path.split("/");
        if (segs[0] === mgr && segs[1] === emp) months.set(segs[2], (months.get(segs[2]) || 0) + 1);
      }
      return json(res, 200, [...months.entries()].map(([name, file_count]) => ({ name, rel_path: mgr + "/" + emp + "/" + name, file_count })));
    }
    if (parts[1] === "managers" && parts[5] === "months" && method === "POST" && parts.length === 6) {
      const body = await readJson(req);
      const rel = decode(parts[2]) + "/" + decode(parts[4]) + "/" + body.month_label;
      return json(res, 200, { name: body.month_label, rel_path: rel, file_count: 0 });
    }
    if (parts[1] === "managers" && parts[5] === "months" && parts[7] === "items" && method === "GET") {
      const mgr = decode(parts[2]); const emp = decode(parts[4]); const month = decode(parts[6]);
      const prefix = mgr + "/" + emp + "/" + month + "/";
      return json(res, 200, s.vaultFiles.filter((f) => f.rel_path.startsWith(prefix)).map(({ pdfKey, ...rest }) => rest));
    }
    if (parts[1] === "managers" && parts[5] === "months" && parts[7] === "files" && method === "POST") {
      const buf = await readBody(req);
      const names = parseMultipartFilenames(buf, req.headers["content-type"]);
      const mgr = decode(parts[2]); const emp = decode(parts[4]); const month = decode(parts[6]);
      const created = names.map((name) => {
        const rel = mgr + "/" + emp + "/" + month + "/" + name;
        const item = { name, rel_path: rel, size: 3000, content_type: "application/pdf", stored_at: new Date().toISOString(), pdfKey: "generic" };
        s.vaultFiles.push(item);
        const { pdfKey, ...rest } = item;
        return rest;
      });
      return json(res, 200, created);
    }
    if (parts[1] === "projects" && method === "GET" && parts.length === 2) {
      const map = new Map<string, number>();
      for (const e of s.employees) if (e.project) map.set(e.project, (map.get(e.project) || 0) + 1);
      return json(res, 200, [...map.entries()].map(([name, employee_count]) => ({ name, employee_count })));
    }
    if (parts[1] === "projects" && parts[3] === "employees" && method === "GET") {
      const project = decode(parts[2]);
      return json(res, 200, s.employees.filter((e) => e.project === project).map((e) => ({
        employee_pk: e.id, employee_id: e.employee_id, name: e.name, project: e.project, location: e.location,
        account_manager: e.account_manager || "", employee_folder: e.name, month_count: 1,
      })));
    }
    if (parts[1] === "locations" && method === "GET" && parts.length === 2) {
      const map = new Map<string, number>();
      for (const e of s.employees) if (e.location) map.set(e.location, (map.get(e.location) || 0) + 1);
      return json(res, 200, [...map.entries()].map(([name, employee_count]) => ({ name, employee_count })));
    }
    if (parts[1] === "locations" && parts[3] === "employees" && method === "GET") {
      const location = decode(parts[2]);
      return json(res, 200, s.employees.filter((e) => e.location === location).map((e) => ({
        employee_pk: e.id, employee_id: e.employee_id, name: e.name, project: e.project, location: e.location,
        account_manager: e.account_manager || "", employee_folder: e.name, month_count: 1,
      })));
    }
    if (parts[1] === "search-employees" && method === "GET") {
      const qq = (query.get("q") || "").toLowerCase();
      return json(res, 200, s.employees.filter((e) =>
        e.name.toLowerCase().includes(qq) || e.employee_id.toLowerCase().includes(qq) || (e.project || "").toLowerCase().includes(qq)
      ).map((e) => ({
        employee_pk: e.id, employee_id: e.employee_id, name: e.name, project: e.project, location: e.location,
        account_manager: e.account_manager || "", employee_folder: e.name, month_count: 1,
      })));
    }
    if (parts[1] === "employee-vault" && parts[3] === "months" && method === "GET") {
      const emp = s.employees.find((e) => e.id === decode(parts[2]));
      if (!emp) return json(res, 200, []);
      const months = new Map<string, number>();
      for (const f of s.vaultFiles) {
        if (f.rel_path.includes("/" + emp.name + "/")) {
          const mo = f.rel_path.split("/")[2];
          months.set(mo, (months.get(mo) || 0) + 1);
        }
      }
      return json(res, 200, [...months.entries()].map(([name, file_count]) => ({
        name, rel_path: (emp.account_manager || "") + "/" + emp.name + "/" + name, file_count,
      })));
    }
    if (parts[1] === "employee-vault" && parts[3] === "months" && parts[5] === "items" && method === "GET") {
      const emp = s.employees.find((e) => e.id === decode(parts[2]));
      const month = decode(parts[4]);
      if (!emp) return json(res, 200, []);
      const prefix = (emp.account_manager || "") + "/" + emp.name + "/" + month + "/";
      return json(res, 200, s.vaultFiles.filter((f) => f.rel_path.startsWith(prefix)).map(({ pdfKey, ...r }) => r));
    }
    if ((parts[1] === "content" || parts[1] === "render") && method === "GET") {
      const rel = query.get("rel_path") || "";
      const f = s.vaultFiles.find((x) => x.rel_path === rel);
      return sendPdf(res, getPdf(f?.pdfKey), f?.name || "file.pdf");
    }
    if (parts[1] === "download-size" && method === "GET") {
      const files = s.vaultFiles.length; const bytes = s.vaultFiles.reduce((a, f) => a + f.size, 0);
      return json(res, 200, { files, bytes });
    }
    if (parts[1] === "download-zip" && method === "GET") {
      res.writeHead(200, { "Content-Type": "application/zip", "Content-Disposition": "attachment; filename=vault.zip" });
      return res.end(Buffer.from("PK\x05\x06" + "\x00".repeat(18))); // minimal empty zip-ish
    }
    if (parts[1] === "years" && method === "GET") {
      const { year } = currentPeriod();
      return json(res, 200, [{ year, files: s.vaultFiles.length, bytes: s.vaultFiles.reduce((a, f) => a + f.size, 0) }, { year: year - 1, files: 2, bytes: 8000 }]);
    }
    if (parts[1] === "file" && method === "DELETE") {
      const rel = query.get("rel_path") || "";
      const idx = s.vaultFiles.findIndex((f) => f.rel_path === rel);
      if (idx >= 0) s.vaultFiles.splice(idx, 1);
      return json(res, 200, { ok: true });
    }
    if (parts[1] === "folder" && method === "PATCH") {
      const body = await readJson(req);
      return json(res, 200, { ok: true, rel_path: body.rel_path, new_name: body.new_name });
    }
    if (parts[1] === "folder" && method === "DELETE") {
      const rel = query.get("rel_path") || "";
      s.vaultFiles = s.vaultFiles.filter((f) => !f.rel_path.startsWith(rel));
      return json(res, 200, { ok: true });
    }
    if (parts[1] === "move-path" && method === "POST") {
      const body = await readJson(req);
      const f = s.vaultFiles.find((x) => x.rel_path === body.src_rel_path);
      if (f) {
        if (body.as_copy) s.vaultFiles.push({ ...f, rel_path: body.dst_rel_path, name: body.dst_rel_path.split("/").pop() || f.name });
        else { f.rel_path = body.dst_rel_path; f.name = body.dst_rel_path.split("/").pop() || f.name; }
      }
      return json(res, 200, { rel_path: body.dst_rel_path });
    }
    if (parts[1] === "record-for" && method === "GET") {
      const monthLabel = query.get("month") || "";
      const empPk = query.get("employee_pk");
      let emp = empPk ? s.employees.find((e) => e.id === empPk) : null;
      if (!emp && query.get("manager") && query.get("employee_folder")) {
        emp = s.employees.find((e) => e.account_manager === query.get("manager") && e.name === query.get("employee_folder")) || null;
      }
      const m = monthLabel.match(/([A-Za-z]+)\s+(\d{4})/);
      const monthNum = m ? MONTHS_LONG.findIndex((x) => x === m[1]) : 0;
      const yearNum = m ? Number(m[2]) : 0;
      const rec = s.records.find((r) => r.matched_employee_pk === emp?.id && r.month === monthNum && r.year === yearNum);
      if (!rec) return json(res, 404, { detail: "No record" });
      return json(res, 200, { record_id: rec.id });
    }
    if (parts[1] === "eml-preview" && method === "GET") return json(res, 200, emlPreview("Vault eml", "vault@demo.local"));
    if (parts[1] === "eml-preview-upload" && method === "POST") {
      await readBody(req);
      return json(res, 200, emlPreview("Uploaded eml", "upload@demo.local"));
    }
  }

  // ---- Employee matcher ----
  if (parts[0] === "employee-matcher") {
    if (parts.length === 1 && method === "GET") return json(res, 200, s.employees);
    if (parts.length === 1 && method === "POST") {
      const body = await readJson(req);
      const e = { ...body, id: nextId("emp") };
      s.employees.push(e);
      return json(res, 200, e);
    }
    if (parts[1] === "import" && parts[2] === "preview" && method === "POST") {
      await readBody(req);
      return json(res, 200, { to_add: [], to_update: [], unchanged: s.employees.slice(0, 3).map((e) => ({ id: e.id, employee_id: e.employee_id, name: e.name, location: e.location, account_manager: e.account_manager, employee_email_id: e.employee_email_id, work_email: e.work_email, personal_email: e.personal_email, active: e.active })), missing_from_file: [], skipped: [] });
    }
    if (parts[1] === "import" && method === "POST") {
      await readBody(req);
      return json(res, 200, { inserted: 0, updated: 0, skipped: 0, skipped_details: [] });
    }
    if (parts[1] && parts[2] === "status" && method === "PATCH") {
      const body = await readJson(req);
      const e = s.employees.find((x) => x.id === parts[1]);
      if (!e) return json(res, 404, { detail: "Not found" });
      e.active = !!body.active;
      return json(res, 200, e);
    }
    if (parts[1] && method === "PUT") {
      const body = await readJson(req);
      const idx = s.employees.findIndex((x) => x.id === parts[1]);
      if (idx < 0) return json(res, 404, { detail: "Not found" });
      s.employees[idx] = { ...s.employees[idx], ...body, id: parts[1] };
      return json(res, 200, s.employees[idx]);
    }
  }

  // ---- Upload ----
  if (parts[0] === "upload") {
    if (parts[1] === "stream" && method === "POST") {
      const buf = await readBody(req);
      const names = parseMultipartFilenames(buf, req.headers["content-type"]);
      const { month, year } = currentPeriod();
      const staged = names.map((filename) => {
        const id = nextId("pipe");
        const item: PipelineSeed = {
          id, filename, content_type: "application/pdf", size_bytes: 3000, source_kind: "upload",
          source_id: null, attachment_id: null, status: "needs_review", stage: "staged",
          failure_code: null, failure_label: null, failure_detail: null,
          events: [{ stage: "upload", status: "ok", detail: "Uploaded", at: new Date().toISOString() }],
          employee_id: "E1007", employee_name: "Mei Ling", month, year, record_id: null,
          extraction_model: "demo-gpt", extraction_method: "vision", used_ocr: false,
          extraction_meta: { staged: { employee_pk: "emp-007", matched_name: "Mei Ling", matched_employee_id: "E1007", month, year, buckets: {}, auto_accept: true } },
          auto_accepted: true, can_retry: true, can_resolve_assign: true, resolved_at: null, resolution_note: null,
          created_at: new Date().toISOString(), updated_at: new Date().toISOString(), pdfKey: "generic",
        };
        s.pipeline.unshift(item);
        return stripPipe(item);
      });
      await streamExtractionDemo(res, { staged, groups: staged.length, message: "Upload extraction complete" });
      return;
    }
    if (parts[1] === "manual" && method === "POST") {
      const buf = await readBody(req);
      const text = buf.toString("utf8");
      const get = (name: string) => {
        const m = new RegExp('name="' + name + '"[\\r\\n]+([\\s\\S]*?)(?:\\r?\\n--)').exec(text);
        return m ? m[1].trim() : "";
      };
      const emp = s.employees.find((e) => e.id === get("employee_pk"));
      const month = Number(get("month")); const year = Number(get("year"));
      let buckets: any = {};
      try { buckets = JSON.parse(get("buckets") || "{}"); } catch { buckets = {}; }
      const recId = nextId("rec");
      const pipeId = nextId("pipe");
      const rec: RecordSeed = {
        id: recId, matched_employee_pk: emp?.id ?? null, employee_id: emp?.employee_id ?? null, employee_name: emp?.name ?? null,
        account_manager: emp?.account_manager ?? null, dco_number: emp?.dco_number ?? null, match_note: "Manual upload",
        month, year, calendar_days: 30,
        annual_leave_dates: buckets.annual_leave || [], remote_work_dates: buckets.remote_work || [], sick_leave_dates: buckets.sick_leave || [],
        maternity_leave_dates: [], unpaid_leave_dates: [], absent_dates: [], public_holiday_dates: [], other_leave_dates: [],
        working_dates: buckets.working || [], weekend_dates: buckets.weekend || [],
        annual_leave_count: 0, remote_work_count: 0, sick_leave_count: 0, maternity_leave_count: 0, unpaid_leave_count: 0,
        absent_count: 0, public_holiday_count: 0, other_leave_count: 0, working_dates_count: 0, weekend_dates_count: 0,
        validation_status: "manual_review", llm_summary: get("note") || "Manual", hr_flags: [],
        approval_detected: false, approval_detail: null, approval_status: "pending",
        source_email_id: null, storage_folder: null, source_files: [], source_file_count: 0,
      };
      recount(rec); s.records.push(rec);
      s.pipeline.unshift({
        id: pipeId, filename: "manual.pdf", content_type: "application/pdf", size_bytes: 3000, source_kind: "manual",
        source_id: null, attachment_id: null, status: "success", stage: "filed",
        failure_code: null, failure_label: null, failure_detail: null,
        events: [{ stage: "manual", status: "ok", detail: "OK", at: new Date().toISOString() }],
        employee_id: emp?.employee_id ?? null, employee_name: emp?.name ?? null, month, year, record_id: recId,
        extraction_model: null, extraction_method: "manual", used_ocr: false, extraction_meta: null,
        auto_accepted: false, can_retry: false, can_resolve_assign: false, resolved_at: null, resolution_note: null,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(), pdfKey: "generic",
      });
      return json(res, 200, {
        pipeline_id: pipeId, filename: "manual.pdf", status: "success", failure_code: null, failure_detail: null,
        record_id: recId, employee_name: emp?.name ?? null, employee_id: emp?.employee_id ?? null,
        month, year, validation_status: "manual_review", llm_summary: rec.llm_summary, match_note: rec.match_note,
      });
    }
  }

  // ---- Bulk roster ----
  if (parts[0] === "bulk-upload") {
    const { month, year } = currentPeriod();
    if (parts[1] === "preview" && method === "POST") {
      await readBody(req);
      return json(res, 200, {
        filename: "roster.xlsx", method: "xlsx-cells", month: Number(query.get("month") || month), year: Number(query.get("year") || year),
        calendar_days: 30, agency: "Demo Agency", headcount: 3, matched: 2, unmatched: 1, flagged: 0, llm_calls: 0, issues: [],
        rows: [
          { sr_no: 1, name: "Mei Ling", title: "Engineer", location: "Dubai", confirmation: "OK", stated_leave_days: 2, stated_billing_days: 20, leave_days_read: 2, working_days_read: 20, weekend_days_read: 8, uncertain_days: 0, matched_name: "Mei Ling", matched_employee_id: "E1007", issues: [] },
          { sr_no: 2, name: "Carlos Mendes", title: "Analyst", location: "Dubai", confirmation: "OK", stated_leave_days: 0, stated_billing_days: 22, leave_days_read: 0, working_days_read: 22, weekend_days_read: 8, uncertain_days: 0, matched_name: "Carlos Mendes", matched_employee_id: "E1008", issues: [] },
          { sr_no: 3, name: "Unknown Person", title: null, location: null, confirmation: null, stated_leave_days: 1, stated_billing_days: 19, leave_days_read: 1, working_days_read: 19, weekend_days_read: 8, uncertain_days: 1, matched_name: null, matched_employee_id: null, issues: ["Unmatched"] },
        ],
      });
    }
    if (method === "POST") {
      await readBody(req);
      const m = Number(query.get("month") || month); const y = Number(query.get("year") || year);
      for (const name of ["Mei_Ling_roster.pdf", "Carlos_Mendes_roster.pdf"]) {
        s.pipeline.unshift({
          id: nextId("pipe"), filename: name, content_type: "application/pdf", size_bytes: 2500, source_kind: "upload",
          source_id: null, attachment_id: null, status: "needs_review", stage: "staged",
          failure_code: null, failure_label: null, failure_detail: null,
          events: [{ stage: "roster", status: "ok", detail: "Staged from roster", at: new Date().toISOString() }],
          employee_id: name.startsWith("Mei") ? "E1007" : "E1008",
          employee_name: name.startsWith("Mei") ? "Mei Ling" : "Carlos Mendes",
          month: m, year: y, record_id: null, extraction_model: null, extraction_method: "xlsx-cells", used_ocr: false,
          extraction_meta: { staged: { buckets: {} } }, auto_accepted: false, can_retry: true, can_resolve_assign: true,
          resolved_at: null, resolution_note: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), pdfKey: "generic",
        });
      }
      return json(res, 200, { filename: "roster.xlsx", headcount: 3, staged: 2, matched: 2, unmatched: ["Unknown Person"], flagged: 0, month: m, year: y, method: "xlsx-cells", issues: [] });
    }
  }

  // ---- Reminders ----
  if (parts[0] === "reminders") {
    if (parts[1] === "config" && method === "GET") return json(res, 200, s.reminderConfig);
    if (parts[1] === "config" && method === "PUT") {
      const body = await readJson(req);
      Object.assign(s.reminderConfig, body, { updated_at: new Date().toISOString(), updated_by: "admin" });
      return json(res, 200, s.reminderConfig);
    }
    if (parts[1] === "employees" && method === "GET") {
      const month = Number(query.get("month")); const year = Number(query.get("year"));
      let rows = s.employees.filter((e) => e.active).map((e) => {
        const has = s.records.some((r) => r.matched_employee_pk === e.id && r.month === month && r.year === year);
        return {
          employee_pk: e.id, employee_id: e.employee_id, name: e.name, account_manager: e.account_manager,
          location: e.location, email: e.work_email, email_source: "work" as const, missing: !has,
          last_status: null, last_sent_at: null, last_trigger: null, last_error: null,
        };
      });
      if (query.get("only_missing") === "true") rows = rows.filter((r) => r.missing);
      if (query.get("q")) {
        const qq = query.get("q")!.toLowerCase();
        rows = rows.filter((r) => r.name.toLowerCase().includes(qq) || r.employee_id.toLowerCase().includes(qq));
      }
      return json(res, 200, { total: rows.length, rows, email_preference: s.reminderConfig.email_preference });
    }
    if (parts[1] === "export" && method === "GET") {
      res.writeHead(200, { "Content-Type": "text/csv" });
      return res.end("employee_id,name\nE1007,Mei Ling\n");
    }
    if (parts[1] === "send-now" && method === "POST") {
      const body = await readJson(req);
      const emp = s.employees.find((e) => e.id === body.employee_pk);
      const log = {
        id: nextId("rlog"), run_id: null, employee_pk: emp?.id ?? null, employee_id: emp?.employee_id ?? null,
        employee_name: emp?.name ?? null, recipient_email: emp?.work_email ?? null,
        month: body.month, year: body.year, trigger: "manual" as const, status: "sent" as const,
        error: null, sent_at: new Date().toISOString(), created_at: new Date().toISOString(),
      };
      return json(res, 200, log);
    }
    if (parts[1] === "test" && method === "POST") {
      const body = await readJson(req);
      return json(res, 200, {
        id: nextId("rlog"), run_id: null, employee_pk: null, employee_id: null, employee_name: body.employee_name || "Test Employee",
        recipient_email: body.email, month: body.month, year: body.year, trigger: "test", status: "sent",
        error: null, sent_at: new Date().toISOString(), created_at: new Date().toISOString(),
      });
    }
    if (parts[1] === "run-batch" && method === "POST") {
      const body = await readJson(req);
      const { month, year } = currentPeriod();
      const id = nextId("rrun");
      s.reminderRuns.unshift({
        id, trigger: "manual_batch", month: body.month || month, year: body.year || year,
        started_at: new Date().toISOString(), finished_at: new Date().toISOString(),
        total: 2, sent_count: 2, failed_count: 0, skipped_count: 0, triggered_by: "admin", logs: [],
      });
      return json(res, 200, { run_id: id });
    }
    if (parts[1] === "runs" && method === "GET" && !parts[2]) {
      const limit = Number(query.get("limit") || 20);
      return json(res, 200, s.reminderRuns.slice(0, limit).map(({ logs, ...r }) => r));
    }
    if (parts[1] === "runs" && parts[2] && method === "GET") {
      const run = s.reminderRuns.find((r) => r.id === parts[2]);
      if (!run) return json(res, 404, { detail: "Not found" });
      return json(res, 200, run);
    }
  }

  // ---- Admin ----
  if (parts[0] === "admin") {
    if (parts[1] === "users") {
      if (method === "GET" && parts.length === 2) return json(res, 200, s.users.map(publicUser));
      if (method === "POST" && parts.length === 2) {
        const body = await readJson(req);
        const u = { id: nextId("user"), username: body.username, password: body.password, email: body.email || null, role: body.role, auth_mode: body.auth_mode, is_active: true, last_login_at: null, last_seen_at: null, online: false };
        s.users.push(u);
        return json(res, 200, publicUser(u));
      }
      if (parts[2] === "totp-setup" && method === "POST") {
        return json(res, 200, { uri: "otpauth://totp/Demo:admin?secret=DEMOSECRET&issuer=Demo", qr_png: "", manual_secret: "DEMOSECRET", enrolled: true });
      }
      if (method === "PATCH") {
        const body = await readJson(req);
        const u = s.users.find((x) => x.id === parts[2]);
        if (!u) return json(res, 404, { detail: "Not found" });
        Object.assign(u, body);
        return json(res, 200, publicUser(u));
      }
      if (method === "DELETE") {
        const idx = s.users.findIndex((x) => x.id === parts[2]);
        if (idx >= 0) s.users.splice(idx, 1);
        return json(res, 200, { ok: true });
      }
    }
    if (parts[1] === "config" && parts[2] === "status" && method === "GET") return json(res, 200, s.aiStatus);
    if (parts[1] === "calendars") {
      if (method === "GET") return json(res, 200, s.calendars);
      if (method === "PUT") {
        const body = await readJson(req);
        let cal = s.calendars.find((c) => c.month === body.month && c.year === body.year);
        if (!cal) {
          cal = { id: nextId("cal"), ...body, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
          s.calendars.push(cal);
        } else {
          Object.assign(cal, body, { updated_at: new Date().toISOString() });
        }
        return json(res, 200, cal);
      }
      if (method === "DELETE") {
        const idx = s.calendars.findIndex((c) => c.id === parts[2]);
        if (idx >= 0) s.calendars.splice(idx, 1);
        return json(res, 200, { ok: true });
      }
    }
    if (parts[1] === "portal-users") {
      if (method === "GET" && parts.length === 2) return json(res, 200, s.portalUsers.map(publicPortalUser));
      if (method === "POST" && parts.length === 2) {
        const body = await readJson(req);
        const emp = s.employees.find((e) => e.id === body.employee_pk);
        const u = { id: nextId("portal"), username: body.username, password: body.password, role: "employee" as const, employee_pk: body.employee_pk, employee_name: emp?.name ?? null, employee_id: emp?.employee_id ?? null, is_active: true, last_login_at: null };
        s.portalUsers.push(u);
        return json(res, 200, publicPortalUser(u));
      }
      if (method === "PATCH") {
        const body = await readJson(req);
        const u = s.portalUsers.find((x) => x.id === parts[2]);
        if (!u) return json(res, 404, { detail: "Not found" });
        Object.assign(u, body);
        return json(res, 200, publicPortalUser(u));
      }
      if (method === "DELETE") {
        const idx = s.portalUsers.findIndex((x) => x.id === parts[2]);
        if (idx >= 0) s.portalUsers.splice(idx, 1);
        return json(res, 200, { ok: true });
      }
    }
    if (parts[1] === "debug") {
      if (parts[2] === "runs" && method === "GET" && !parts[3]) {
        const limit = Number(query.get("limit") || 50); const offset = Number(query.get("offset") || 0);
        const summaries = s.debugRuns.map(({ pass1_calls, pass2_calls, dropped_items, triage, sheets, errors, ...sum }) => sum);
        return json(res, 200, summaries.slice(offset, offset + limit));
      }
      if (parts[2] === "runs" && parts[3] && method === "GET") {
        const run = s.debugRuns.find((r) => r.id === parts[3]);
        if (!run) return json(res, 404, { detail: "Not found" });
        return json(res, 200, run);
      }
      if (parts[2] === "runs" && method === "DELETE") {
        const n = s.debugRuns.length; s.debugRuns.length = 0;
        return json(res, 200, { deleted: n });
      }
      if (parts[2] === "image" && method === "GET") {
        return sendPdf(res, getPdf("generic"), "debug.pdf");
      }
    }
  }

  return json(res, 501, { detail: "mock: not implemented " + path });
}
