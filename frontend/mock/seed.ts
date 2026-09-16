/**
 * Rich demo seed for the frontend-only Timesheets mock API.
 */
import { makeTimesheetPdf, makeApprovalPng, stagedFromAttendance, type TimesheetLeaveOpts } from "./pdf";

export const MONTHS_LONG = [
  "", "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function currentPeriod() {
  const now = new Date();
  return { month: now.getMonth() + 1, year: now.getFullYear() };
}

function isoDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

function dateInMonth(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function weekendDates(year: number, month: number): string[] {
  const out: string[] = [];
  const n = daysInMonth(year, month);
  for (let d = 1; d <= n; d++) {
    const wd = new Date(year, month - 1, d).getDay();
    if (wd === 0 || wd === 6) out.push(dateInMonth(year, month, d));
  }
  return out;
}

function p(text: string): string {
  return "<p>" + text + "</p>";
}

export type AuthUserSeed = {
  id: string; username: string; password: string; email: string | null;
  role: "admin" | "user" | "viewer" | "vault_matcher";
  auth_mode: "otp" | "totp" | "captcha";
  is_active: boolean; last_login_at: string | null; last_seen_at: string | null; online: boolean;
};

export type PortalUserSeed = {
  id: string; username: string; password: string; role: "employee";
  employee_pk: string | null; employee_name: string | null; employee_id: string | null;
  is_active: boolean; last_login_at: string | null;
};

export type EmployeeSeed = {
  id: string; employee_id: string; name: string;
  aco_number: string | null; dco_number: string | null; account_manager: string | null;
  employee_email_id: string | null; project: string | null; contact_no: string | null;
  location: string | null; work_email: string | null; personal_email: string | null; active: boolean;
};

export type AttachmentSeed = {
  attachment_id: string; filename: string; content_type: string;
  kind: "timesheet" | "approval_screenshot" | "other";
  cid?: string | null; is_inline?: boolean | null; size?: number | null; pdfKey?: string;
};

export type EmailSeed = {
  id: string; provider_message_id: string; sender_name: string | null; sender_email: string | null;
  subject: string | null; received_at: string | null; status: "new" | "archived" | "ingested";
  attachment_count: number; has_approval_screenshot: boolean;
  extract_email_at: string | null; no_sheets_found_at: string | null; no_sheets_note: string | null;
  attachments: AttachmentSeed[]; conversation_id: string | null; thread_id: string | null;
  thread_message_count: number; body_text: string | null; body_html: string | null;
  to_recipients: { name: string | null; email: string }[];
  cc_recipients: { name: string | null; email: string }[];
  inline_attachment_ids: string[]; extracted_filenames?: string[];
  summary?: any; extracted_sheets?: string[]; extracted_at?: string | null;
};

export type PipelineSeed = {
  id: string; filename: string; content_type: string | null; size_bytes: number | null;
  source_kind: "upload" | "email" | "manual" | "portal";
  source_id: string | null; attachment_id: string | null;
  status: "processing" | "success" | "needs_review" | "failed" | "resolved";
  stage: string; failure_code: string | null; failure_label: string | null; failure_detail: string | null;
  events: { stage: string; status: "ok" | "warn" | "fail"; detail: string; at: string }[];
  employee_id: string | null; employee_name: string | null; month: number | null; year: number | null;
  record_id: string | null; extraction_model: string | null; extraction_method: string | null;
  used_ocr: boolean; extraction_meta: Record<string, unknown> | null; auto_accepted: boolean;
  can_retry: boolean; can_resolve_assign: boolean; resolved_at: string | null; resolution_note: string | null;
  created_at: string | null; updated_at: string | null; pdfKey?: string; thread_key?: string | null;
};

export type RecordSeed = {
  id: string; matched_employee_pk: string | null; employee_id: string | null; employee_name: string | null;
  account_manager: string | null; dco_number: string | null; match_note: string | null;
  month: number; year: number; calendar_days: number | null;
  annual_leave_dates: string[]; remote_work_dates: string[]; sick_leave_dates: string[];
  maternity_leave_dates: string[]; unpaid_leave_dates: string[]; absent_dates: string[];
  public_holiday_dates: string[]; other_leave_dates: string[]; working_dates: string[]; weekend_dates: string[];
  annual_leave_count: number; remote_work_count: number; sick_leave_count: number;
  maternity_leave_count: number; unpaid_leave_count: number; absent_count: number;
  public_holiday_count: number; other_leave_count: number; working_dates_count: number; weekend_dates_count: number;
  validation_status: "verified" | "manual_review"; llm_summary: string | null; hr_flags: string[];
  approval_detected: boolean; approval_detail: string | null;
  approval_status: "pending" | "approved" | "not_approved";
  source_email_id: string | null; storage_folder: string | null;
  source_files: any[]; source_file_count: number;
};

export type VaultFileSeed = {
  name: string; rel_path: string; size: number; content_type: string; stored_at: string | null; pdfKey: string;
};

export type PortalSubmissionSeed = {
  id: string; employee_pk: string; employee_name: string | null; employee_id: string | null;
  month: number; year: number; status: "draft" | "submitted" | "rejected";
  manager_decision: "pending" | "not_approved"; manager_note: string | null; decided_at: string | null;
  approval_claimed: boolean; employee_note: string | null;
  extraction_state: "not_started" | "running" | "done" | "failed";
  extraction_error: string | null; review_state: string | null; record_id: string | null;
  submitted_at: string | null; created_at: string; updated_at: string;
  files: any[]; pipeline_files: any[];
};

export type SeedData = {
  users: AuthUserSeed[]; portalUsers: PortalUserSeed[]; employees: EmployeeSeed[];
  emails: EmailSeed[]; pipeline: PipelineSeed[]; records: RecordSeed[]; vaultFiles: VaultFileSeed[];
  calendars: any[]; reminderConfig: any; reminderRuns: any[]; systemNotice: any;
  chatAccess: any; aiStatus: any[]; systemHealth: any[]; portalSubmissions: PortalSubmissionSeed[];
  debugRuns: any[]; autoExtract: any; pdfs: Record<string, Buffer>;
};

function makeRecord(opts: {
  id: string; emp: EmployeeSeed; month: number; year: number;
  annual?: number[]; sick?: number[]; remote?: number[];
  validation?: "verified" | "manual_review";
  approval?: "pending" | "approved" | "not_approved"; emailId?: string | null;
}): RecordSeed {
  const { emp, month, year } = opts;
  const weekends = weekendDates(year, month);
  const annual = (opts.annual ?? []).map((d) => dateInMonth(year, month, d));
  const sick = (opts.sick ?? []).map((d) => dateInMonth(year, month, d));
  const remote = (opts.remote ?? []).map((d) => dateInMonth(year, month, d));
  const leaveSet = new Set([...annual, ...sick, ...remote, ...weekends]);
  const n = daysInMonth(year, month);
  const working: string[] = [];
  for (let d = 1; d <= n; d++) {
    const s = dateInMonth(year, month, d);
    if (!leaveSet.has(s)) working.push(s);
  }
  const folder = `${emp.account_manager}/${emp.name}/${MONTHS_LONG[month]} ${year}`;
  return {
    id: opts.id, matched_employee_pk: emp.id, employee_id: emp.employee_id, employee_name: emp.name,
    account_manager: emp.account_manager, dco_number: emp.dco_number, match_note: "Matched by work email",
    month, year, calendar_days: n,
    annual_leave_dates: annual, remote_work_dates: remote, sick_leave_dates: sick,
    maternity_leave_dates: [], unpaid_leave_dates: [], absent_dates: [], public_holiday_dates: [],
    other_leave_dates: [], working_dates: working, weekend_dates: weekends,
    annual_leave_count: annual.length, remote_work_count: remote.length, sick_leave_count: sick.length,
    maternity_leave_count: 0, unpaid_leave_count: 0, absent_count: 0, public_holiday_count: 0,
    other_leave_count: 0, working_dates_count: working.length, weekend_dates_count: weekends.length,
    validation_status: opts.validation ?? "verified",
    llm_summary: `Timesheet for ${emp.name} — ${MONTHS_LONG[month]} ${year}`,
    hr_flags: [], approval_detected: (opts.approval ?? "approved") === "approved",
    approval_detail: (opts.approval ?? "approved") === "approved" ? "Manager approved via email" : null,
    approval_status: opts.approval ?? "approved", source_email_id: opts.emailId ?? null,
    storage_folder: folder,
    source_files: [{
      key: `${folder}/timesheet.pdf`, filename: `${emp.name.replace(/\s+/g, "_")}_TS.pdf`,
      source_id: opts.emailId ?? null, attachment_id: null, ingested_at: isoDaysAgo(3),
      buckets: { annual_leave: annual, sick_leave: sick, remote_work: remote },
    }],
    source_file_count: 1,
  };
}

export function buildSeed(): SeedData {
  const { month: curM, year: curY } = currentPeriod();
  const prevM = curM === 1 ? 12 : curM - 1;
  const prevY = curM === 1 ? curY - 1 : curY;

  const users: AuthUserSeed[] = [
    { id: "user-admin", username: "admin", password: "admin", email: "admin@demo.local", role: "admin", auth_mode: "captcha", is_active: true, last_login_at: isoDaysAgo(0), last_seen_at: isoDaysAgo(0), online: true },
    { id: "user-user", username: "user", password: "user", email: "user@demo.local", role: "user", auth_mode: "captcha", is_active: true, last_login_at: isoDaysAgo(1), last_seen_at: isoDaysAgo(1), online: false },
    { id: "user-viewer", username: "viewer", password: "viewer", email: "viewer@demo.local", role: "viewer", auth_mode: "captcha", is_active: true, last_login_at: isoDaysAgo(2), last_seen_at: isoDaysAgo(2), online: false },
    { id: "user-vault", username: "vault", password: "vault", email: "vault@demo.local", role: "vault_matcher", auth_mode: "captcha", is_active: true, last_login_at: isoDaysAgo(2), last_seen_at: isoDaysAgo(2), online: false },
  ];

  const employees: EmployeeSeed[] = [
    { id: "emp-001", employee_id: "E1001", name: "Aisha Rahman", aco_number: "ACO-101", dco_number: "DCO-201", account_manager: "Sarah Chen", employee_email_id: "aisha.rahman@demo.local", project: "ADNOC Digitization", contact_no: "+971501000001", location: "Dubai", work_email: "aisha.rahman@demo.local", personal_email: "aisha.r@mail.com", active: true },
    { id: "emp-002", employee_id: "E1002", name: "Omar Hassan", aco_number: "ACO-102", dco_number: "DCO-202", account_manager: "Sarah Chen", employee_email_id: "omar.hassan@demo.local", project: "ADNOC Digitization", contact_no: "+971501000002", location: "Dubai", work_email: "omar.hassan@demo.local", personal_email: "omar.h@mail.com", active: true },
    { id: "emp-003", employee_id: "E1003", name: "Priya Nair", aco_number: "ACO-103", dco_number: "DCO-203", account_manager: "Sarah Chen", employee_email_id: "priya.nair@demo.local", project: "Etisalat Support", contact_no: "+971501000003", location: "Abu Dhabi", work_email: "priya.nair@demo.local", personal_email: "priya.n@mail.com", active: true },
    { id: "emp-004", employee_id: "E1004", name: "Daniel Okoro", aco_number: "ACO-104", dco_number: "DCO-204", account_manager: "Sarah Chen", employee_email_id: "daniel.okoro@demo.local", project: "Etisalat Support", contact_no: "+971501000004", location: "Dubai", work_email: "daniel.okoro@demo.local", personal_email: "daniel.o@mail.com", active: true },
    { id: "emp-005", employee_id: "E1005", name: "Fatima Al Marri", aco_number: "ACO-105", dco_number: "DCO-205", account_manager: "James Okonkwo", employee_email_id: "fatima.almarri@demo.local", project: "Masdar Green", contact_no: "+971501000005", location: "Abu Dhabi", work_email: "fatima.almarri@demo.local", personal_email: "fatima.a@mail.com", active: true },
    { id: "emp-006", employee_id: "E1006", name: "Liam Walsh", aco_number: "ACO-106", dco_number: "DCO-206", account_manager: "James Okonkwo", employee_email_id: "liam.walsh@demo.local", project: "Masdar Green", contact_no: "+971501000006", location: "Abu Dhabi", work_email: "liam.walsh@demo.local", personal_email: "liam.w@mail.com", active: true },
    { id: "emp-007", employee_id: "E1007", name: "Mei Ling", aco_number: "ACO-107", dco_number: "DCO-207", account_manager: "James Okonkwo", employee_email_id: "mei.ling@demo.local", project: "Dubai Metro Ops", contact_no: "+971501000007", location: "Dubai", work_email: "mei.ling@demo.local", personal_email: "mei.l@mail.com", active: true },
    { id: "emp-008", employee_id: "E1008", name: "Carlos Mendes", aco_number: "ACO-108", dco_number: "DCO-208", account_manager: "James Okonkwo", employee_email_id: "carlos.mendes@demo.local", project: "Dubai Metro Ops", contact_no: "+971501000008", location: "Dubai", work_email: "carlos.mendes@demo.local", personal_email: "carlos.m@mail.com", active: true },
  ];

  const portalUsers: PortalUserSeed[] = [{
    id: "portal-001", username: "employee1", password: "portal123", role: "employee",
    employee_pk: "emp-001", employee_name: "Aisha Rahman", employee_id: "E1001",
    is_active: true, last_login_at: isoDaysAgo(2),
  }];

  // Leave day-of-month MUST be weekdays for the demo month (Sat/Sun = WE on the PDF).
  // Sep 2026: 1=Tue … 4=Fri, 7=Mon … 11=Fri, 14=Mon … 18=Fri.
  // Aug 2026: 3=Mon, 4=Tue, 14=Fri, 20=Thu.
  const leaveCur = (empId: string): Pick<TimesheetLeaveOpts, "annualLeave" | "sickLeave" | "remoteWork"> => {
    if (empId === "emp-003") return { annualLeave: [10, 11], sickLeave: [18], remoteWork: [] };
    if (empId === "emp-005") return { annualLeave: [2], sickLeave: [], remoteWork: [14, 15] };
    return { annualLeave: [3, 4], sickLeave: [], remoteWork: [8, 9] };
  };
  const leavePrev = (empId: string): Pick<TimesheetLeaveOpts, "annualLeave" | "sickLeave" | "remoteWork"> => {
    if (empId === "emp-002") return { annualLeave: [3, 4], sickLeave: [14], remoteWork: [] };
    if (empId === "emp-001") return { annualLeave: [3, 4], sickLeave: [], remoteWork: [20] };
    return { annualLeave: [3, 4], sickLeave: [], remoteWork: [20] };
  };

  const pdfs: Record<string, Buffer> = {};
  for (const emp of employees) {
    const cur = leaveCur(emp.id);
    const prev = leavePrev(emp.id);
    pdfs[`ts-${emp.id}-${curY}-${curM}`] = makeTimesheetPdf(emp.name, curM, curY, {
      employeeId: emp.employee_id, project: emp.project || "Project", manager: emp.account_manager || "Manager", ...cur,
    });
    pdfs[`ts-${emp.id}-${prevY}-${prevM}`] = makeTimesheetPdf(emp.name, prevM, prevY, {
      employeeId: emp.employee_id, project: emp.project || "Project", manager: emp.account_manager || "Manager", ...prev,
    });
  }
  pdfs["approval-001"] = makeApprovalPng("APPROVED");
  pdfs["generic"] = makeTimesheetPdf("Demo Employee", curM, curY, {
    employeeId: "E0000", project: "Demo Project", manager: "Sarah Chen",
    annualLeave: [3, 4], remoteWork: [8, 9], sickLeave: [],
  });

  const tsSize = (key: string) => pdfs[key]?.length ?? 8000;
  const emails: EmailSeed[] = [
    {
      id: "msg-001", provider_message_id: "graph-001", sender_name: "Aisha Rahman", sender_email: "aisha.rahman@demo.local",
      subject: `Timesheet — ${MONTHS_LONG[curM]} ${curY}`, received_at: isoDaysAgo(1), status: "new",
      attachment_count: 2, has_approval_screenshot: true, extract_email_at: null, no_sheets_found_at: null, no_sheets_note: null,
      conversation_id: "conv-001", thread_id: "msg-001", thread_message_count: 2,
      body_text: "Please find my timesheet attached for review.", body_html: p("Please find my timesheet attached for review."),
      to_recipients: [{ name: "Sarah Chen", email: "sarah.chen@demo.local" }], cc_recipients: [], inline_attachment_ids: [],
      attachments: [
        { attachment_id: "att-001a", filename: "Aisha_Rahman_TS.pdf", content_type: "application/pdf", kind: "timesheet", size: tsSize(`ts-emp-001-${curY}-${curM}`), pdfKey: `ts-emp-001-${curY}-${curM}` },
        { attachment_id: "att-001b", filename: "approval.png", content_type: "image/png", kind: "approval_screenshot", size: pdfs["approval-001"].length, pdfKey: "approval-001" },
      ],
      summary: { headline: "Aisha submitted timesheet awaiting review", status: "sheet_submitted", narrative: "Employee sent timesheet PDF with approval screenshot.", timesheet_sent: true, approval_requested: false, approval_given: true, period: `${MONTHS_LONG[curM]} ${curY}`, employee: "Aisha Rahman", action_needed: "Review in pipeline", message_count: 2, model: "demo-gpt", at: isoDaysAgo(1) },
      extracted_sheets: [], extracted_at: null,
    },
    {
      id: "msg-001b", provider_message_id: "graph-001b", sender_name: "Sarah Chen", sender_email: "sarah.chen@demo.local",
      subject: `Re: Timesheet — ${MONTHS_LONG[curM]} ${curY}`, received_at: isoDaysAgo(0), status: "new",
      attachment_count: 0, has_approval_screenshot: false, extract_email_at: null, no_sheets_found_at: null, no_sheets_note: null,
      conversation_id: "conv-001", thread_id: "msg-001", thread_message_count: 2,
      body_text: "Thanks Aisha, I will review shortly.", body_html: p("Thanks Aisha, I will review shortly."),
      to_recipients: [{ name: "Aisha Rahman", email: "aisha.rahman@demo.local" }], cc_recipients: [], inline_attachment_ids: [], attachments: [],
    },
    {
      id: "msg-002", provider_message_id: "graph-002", sender_name: "Omar Hassan", sender_email: "omar.hassan@demo.local",
      subject: `TS ${MONTHS_LONG[prevM]} ${prevY} — Omar`, received_at: isoDaysAgo(5), status: "new",
      attachment_count: 1, has_approval_screenshot: false, extract_email_at: isoDaysAgo(4), no_sheets_found_at: null, no_sheets_note: null,
      conversation_id: "conv-002", thread_id: "msg-002", thread_message_count: 1,
      body_text: "Attached timesheet for last month.", body_html: p("Attached timesheet for last month."),
      to_recipients: [{ name: "Timesheets", email: "timesheets@demo.local" }], cc_recipients: [], inline_attachment_ids: [],
      attachments: [{ attachment_id: "att-002a", filename: "Omar_Hassan_TS.pdf", content_type: "application/pdf", kind: "timesheet", size: tsSize(`ts-emp-002-${prevY}-${prevM}`), pdfKey: `ts-emp-002-${prevY}-${prevM}` }],
      extracted_filenames: ["Omar_Hassan_TS.pdf"], extracted_sheets: ["Omar_Hassan_TS.pdf"], extracted_at: isoDaysAgo(4),
      summary: { headline: "Omar prior-month sheet already extracted", status: "approved", narrative: "Sheet extracted and staged previously.", timesheet_sent: true, approval_requested: false, approval_given: true, period: `${MONTHS_LONG[prevM]} ${prevY}`, employee: "Omar Hassan", action_needed: "None", message_count: 1, model: "demo-gpt", at: isoDaysAgo(4) },
    },
    {
      id: "msg-003", provider_message_id: "graph-003", sender_name: "Priya Nair", sender_email: "priya.nair@demo.local",
      subject: `Timesheet ${MONTHS_LONG[curM]} — Priya`, received_at: isoDaysAgo(2), status: "new",
      attachment_count: 1, has_approval_screenshot: false, extract_email_at: null, no_sheets_found_at: null, no_sheets_note: null,
      conversation_id: "conv-003", thread_id: "msg-003", thread_message_count: 1,
      body_text: "Please process my timesheet.", body_html: p("Please process my timesheet."),
      to_recipients: [{ name: "Timesheets", email: "timesheets@demo.local" }], cc_recipients: [], inline_attachment_ids: [],
      attachments: [{ attachment_id: "att-003a", filename: "Priya_Nair_TS.pdf", content_type: "application/pdf", kind: "timesheet", size: 4100, pdfKey: `ts-emp-003-${curY}-${curM}` }],
      summary: { headline: "Priya submitted current month timesheet", status: "awaiting_approval", narrative: "Sheet attached, no approval screenshot yet.", timesheet_sent: true, approval_requested: true, approval_given: false, period: `${MONTHS_LONG[curM]} ${curY}`, employee: "Priya Nair", action_needed: "Extract and review", message_count: 1, model: "demo-gpt", at: isoDaysAgo(2) },
    },
    {
      id: "msg-004", provider_message_id: "graph-004", sender_name: "Fatima Al Marri", sender_email: "fatima.almarri@demo.local",
      subject: "FW: Timesheet + leave note", received_at: isoDaysAgo(3), status: "new",
      attachment_count: 2, has_approval_screenshot: true, extract_email_at: null, no_sheets_found_at: null, no_sheets_note: null,
      conversation_id: "conv-004", thread_id: "msg-004", thread_message_count: 1,
      body_text: "Forwarding my sheet with sick leave note.", body_html: p("Forwarding my sheet with sick leave note."),
      to_recipients: [{ name: "James Okonkwo", email: "james.okonkwo@demo.local" }], cc_recipients: [], inline_attachment_ids: [],
      attachments: [
        { attachment_id: "att-004a", filename: "Fatima_TS.pdf", content_type: "application/pdf", kind: "timesheet", size: 4000, pdfKey: `ts-emp-005-${curY}-${curM}` },
        { attachment_id: "att-004b", filename: "mgr_ok.png", content_type: "image/png", kind: "approval_screenshot", size: 1600, pdfKey: "approval-001" },
      ],
    },
    {
      id: "msg-005", provider_message_id: "graph-005", sender_name: "Unknown Sender", sender_email: "contractor@external.com",
      subject: "Timesheet from contractor", received_at: isoDaysAgo(6), status: "new",
      attachment_count: 1, has_approval_screenshot: false, extract_email_at: null, no_sheets_found_at: null, no_sheets_note: null,
      conversation_id: "conv-005", thread_id: "msg-005", thread_message_count: 1,
      body_text: "Please find attached.", body_html: p("Please find attached."),
      to_recipients: [{ name: "Timesheets", email: "timesheets@demo.local" }], cc_recipients: [], inline_attachment_ids: [],
      attachments: [{ attachment_id: "att-005a", filename: "unknown_sheet.pdf", content_type: "application/pdf", kind: "timesheet", size: 3500, pdfKey: "generic" }],
    },
    {
      id: "msg-006", provider_message_id: "graph-006", sender_name: "Mei Ling", sender_email: "mei.ling@demo.local",
      subject: "Old chase — timesheet?", received_at: isoDaysAgo(20), status: "archived",
      attachment_count: 0, has_approval_screenshot: false, extract_email_at: null, no_sheets_found_at: isoDaysAgo(19), no_sheets_note: "No attachments found",
      conversation_id: "conv-006", thread_id: "msg-006", thread_message_count: 1,
      body_text: "Just checking if you received my sheet last week?", body_html: p("Just checking if you received my sheet last week?"),
      to_recipients: [{ name: "Timesheets", email: "timesheets@demo.local" }], cc_recipients: [], inline_attachment_ids: [], attachments: [],
      summary: { headline: "Chase email — no sheet attached", status: "chasing", narrative: "Employee chasing prior submission; no attachment.", timesheet_sent: false, approval_requested: false, approval_given: false, period: "", employee: "Mei Ling", action_needed: "None", message_count: 1, model: "demo-gpt", at: isoDaysAgo(19) },
    },
  ];

  const pipeline: PipelineSeed[] = [
    {
      id: "pipe-001", filename: "Aisha_Rahman_TS.pdf", content_type: "application/pdf", size_bytes: tsSize(`ts-emp-001-${curY}-${curM}`),
      source_kind: "email", source_id: "graph-001", attachment_id: "att-001a", status: "needs_review", stage: "staged",
      failure_code: null, failure_label: null, failure_detail: null,
      events: [
        { stage: "ingest", status: "ok", detail: "Attachment saved", at: isoDaysAgo(1) },
        { stage: "extract", status: "ok", detail: "Vision extract OK", at: isoDaysAgo(1) },
        { stage: "match", status: "ok", detail: "Matched emp-001", at: isoDaysAgo(1) },
      ],
      employee_id: "E1001", employee_name: "Aisha Rahman", month: curM, year: curY, record_id: null,
      extraction_model: "demo-gpt", extraction_method: "vision", used_ocr: false, auto_accepted: true,
      can_retry: true, can_resolve_assign: true, resolved_at: null, resolution_note: null,
      created_at: isoDaysAgo(1), updated_at: isoDaysAgo(1), pdfKey: `ts-emp-001-${curY}-${curM}`, thread_key: "conv-001",
      extraction_meta: {
        staged: stagedFromAttendance(curY, curM, employees[0], leaveCur("emp-001")),
        full_email_extract: {
          approval: { detected: true, detail: "Manager approval screenshot attached (Sarah Chen)" },
          sheets: [{ filename: "Aisha_Rahman_TS.pdf", employee_name: "Aisha Rahman", employee_id: "E1001" }],
        },
        auto_accept: { accepted: true, confidence: "high", reasons: ["Employee matched", "Leave buckets complete", "Approval detected"], blockers: [] },
      },
    },
    {
      id: "pipe-002", filename: "Omar_Hassan_TS.pdf", content_type: "application/pdf", size_bytes: tsSize(`ts-emp-002-${prevY}-${prevM}`),
      source_kind: "email", source_id: "graph-002", attachment_id: "att-002a", status: "success", stage: "filed",
      failure_code: null, failure_label: null, failure_detail: null,
      events: [
        { stage: "ingest", status: "ok", detail: "OK", at: isoDaysAgo(5) },
        { stage: "extract", status: "ok", detail: "OK", at: isoDaysAgo(4) },
        { stage: "file", status: "ok", detail: "Filed rec-001", at: isoDaysAgo(4) },
      ],
      employee_id: "E1002", employee_name: "Omar Hassan", month: prevM, year: prevY, record_id: "rec-001",
      extraction_model: "demo-gpt", extraction_method: "vision", used_ocr: false, auto_accepted: false,
      can_retry: false, can_resolve_assign: false, resolved_at: null, resolution_note: null,
      created_at: isoDaysAgo(5), updated_at: isoDaysAgo(4), pdfKey: `ts-emp-002-${prevY}-${prevM}`, thread_key: "conv-002",
      extraction_meta: { staged: stagedFromAttendance(prevY, prevM, employees[1], leavePrev("emp-002")) },
    },
    {
      id: "pipe-003", filename: "Priya_Nair_TS.pdf", content_type: "application/pdf", size_bytes: tsSize(`ts-emp-003-${curY}-${curM}`),
      source_kind: "email", source_id: "graph-003", attachment_id: "att-003a", status: "needs_review", stage: "staged",
      failure_code: null, failure_label: null, failure_detail: null,
      events: [
        { stage: "ingest", status: "ok", detail: "OK", at: isoDaysAgo(2) },
        { stage: "extract", status: "ok", detail: "OK", at: isoDaysAgo(2) },
        { stage: "match", status: "ok", detail: "Matched", at: isoDaysAgo(2) },
      ],
      employee_id: "E1003", employee_name: "Priya Nair", month: curM, year: curY, record_id: null,
      extraction_model: "demo-gpt", extraction_method: "vision", used_ocr: false, auto_accepted: false,
      can_retry: true, can_resolve_assign: true, resolved_at: null, resolution_note: null,
      created_at: isoDaysAgo(2), updated_at: isoDaysAgo(2), pdfKey: `ts-emp-003-${curY}-${curM}`, thread_key: "conv-003",
      extraction_meta: {
        staged: stagedFromAttendance(curY, curM, employees[2], leaveCur("emp-003"), ["No approval screenshot"]),
        full_email_extract: {
          approval: { detected: false, detail: "" },
          sheets: [{ filename: "Priya_Nair_TS.pdf", employee_name: "Priya Nair", employee_id: "E1003" }],
        },
        auto_accept: { accepted: false, confidence: "low", reasons: [], blockers: ["No approval evidence"] },
      },
    },
    {
      id: "pipe-004", filename: "unknown_sheet.pdf", content_type: "application/pdf", size_bytes: tsSize("generic"),
      source_kind: "email", source_id: "graph-005", attachment_id: "att-005a", status: "needs_review", stage: "match",
      failure_code: "no_employee_match", failure_label: "Employee not matched", failure_detail: "Sender not in Employee Matcher",
      events: [
        { stage: "ingest", status: "ok", detail: "OK", at: isoDaysAgo(6) },
        { stage: "extract", status: "ok", detail: "OK", at: isoDaysAgo(6) },
        { stage: "match", status: "fail", detail: "No match", at: isoDaysAgo(6) },
      ],
      employee_id: null, employee_name: null, month: curM, year: curY, record_id: null,
      extraction_model: "demo-gpt", extraction_method: "vision", used_ocr: true, auto_accepted: false,
      can_retry: true, can_resolve_assign: true, resolved_at: null, resolution_note: null,
      created_at: isoDaysAgo(6), updated_at: isoDaysAgo(6), pdfKey: "generic", thread_key: "conv-005",
      extraction_meta: {
        staged: stagedFromAttendance(curY, curM, null, { annualLeave: [3, 4], remoteWork: [8, 9], sickLeave: [] }, ["Unmatched employee"]),
      },
    },
    {
      id: "pipe-005", filename: "Fatima_TS.pdf", content_type: "application/pdf", size_bytes: tsSize(`ts-emp-005-${curY}-${curM}`),
      source_kind: "email", source_id: "graph-004", attachment_id: "att-004a", status: "failed", stage: "extract",
      failure_code: "extract_error", failure_label: "Extraction failed", failure_detail: "Demo: corrupted page image",
      events: [
        { stage: "ingest", status: "ok", detail: "OK", at: isoDaysAgo(3) },
        { stage: "extract", status: "fail", detail: "Vision error", at: isoDaysAgo(3) },
      ],
      employee_id: "E1005", employee_name: "Fatima Al Marri", month: curM, year: curY, record_id: null,
      extraction_model: "demo-gpt", extraction_method: "vision", used_ocr: true, auto_accepted: false,
      can_retry: true, can_resolve_assign: true, resolved_at: null, resolution_note: null,
      created_at: isoDaysAgo(3), updated_at: isoDaysAgo(3), pdfKey: `ts-emp-005-${curY}-${curM}`, thread_key: "conv-004",
      extraction_meta: null,
    },
    {
      id: "pipe-006", filename: "upload_batch_mei.pdf", content_type: "application/pdf", size_bytes: tsSize(`ts-emp-007-${curY}-${curM}`),
      source_kind: "upload", source_id: null, attachment_id: null, status: "processing", stage: "extract",
      failure_code: null, failure_label: null, failure_detail: null,
      events: [{ stage: "ingest", status: "ok", detail: "Upload received", at: isoDaysAgo(0) }],
      employee_id: "E1007", employee_name: "Mei Ling", month: curM, year: curY, record_id: null,
      extraction_model: null, extraction_method: null, used_ocr: false, auto_accepted: false,
      can_retry: false, can_resolve_assign: false, resolved_at: null, resolution_note: null,
      created_at: isoDaysAgo(0), updated_at: isoDaysAgo(0), pdfKey: `ts-emp-007-${curY}-${curM}`,
      extraction_meta: null,
    },
    {
      id: "pipe-007", filename: "Liam_Walsh_manual.pdf", content_type: "application/pdf", size_bytes: tsSize(`ts-emp-006-${prevY}-${prevM}`),
      source_kind: "manual", source_id: null, attachment_id: null, status: "success", stage: "filed",
      failure_code: null, failure_label: null, failure_detail: null,
      events: [
        { stage: "manual", status: "ok", detail: "Manual entry", at: isoDaysAgo(8) },
        { stage: "file", status: "ok", detail: "Filed rec-002", at: isoDaysAgo(8) },
      ],
      employee_id: "E1006", employee_name: "Liam Walsh", month: prevM, year: prevY, record_id: "rec-002",
      extraction_model: null, extraction_method: "manual", used_ocr: false, auto_accepted: false,
      can_retry: false, can_resolve_assign: false, resolved_at: null, resolution_note: null,
      created_at: isoDaysAgo(8), updated_at: isoDaysAgo(8), pdfKey: `ts-emp-006-${prevY}-${prevM}`,
      extraction_meta: null,
    },
    {
      id: "pipe-008", filename: "portal_aisha_ts.pdf", content_type: "application/pdf", size_bytes: tsSize(`ts-emp-001-${prevY}-${prevM}`),
      source_kind: "portal", source_id: "psub-002", attachment_id: null, status: "needs_review", stage: "staged",
      failure_code: null, failure_label: null, failure_detail: null,
      events: [
        { stage: "portal", status: "ok", detail: "Portal submit", at: isoDaysAgo(1) },
        { stage: "extract", status: "ok", detail: "OK", at: isoDaysAgo(1) },
      ],
      employee_id: "E1001", employee_name: "Aisha Rahman", month: prevM, year: prevY, record_id: null,
      extraction_model: "demo-gpt", extraction_method: "vision", used_ocr: false, auto_accepted: true,
      can_retry: true, can_resolve_assign: true, resolved_at: null, resolution_note: null,
      created_at: isoDaysAgo(1), updated_at: isoDaysAgo(1), pdfKey: `ts-emp-001-${prevY}-${prevM}`,
      extraction_meta: {
        staged: stagedFromAttendance(prevY, prevM, employees[0], leavePrev("emp-001")),
        full_email_extract: {
          approval: { detected: true, detail: "Employee claimed manager approval on portal submit" },
          sheets: [{ filename: "portal_aisha_ts.pdf", employee_name: "Aisha Rahman", employee_id: "E1001" }],
        },
        auto_accept: { accepted: true, confidence: "high", reasons: ["Portal attestation", "Buckets match sheet"], blockers: [] },
      },
    },
  ];

  const records: RecordSeed[] = [
    makeRecord({ id: "rec-001", emp: employees[1], month: prevM, year: prevY, annual: [3, 4], sick: [14], validation: "verified", approval: "approved", emailId: "msg-002" }),
    makeRecord({ id: "rec-002", emp: employees[5], month: prevM, year: prevY, annual: [8], remote: [20, 21], validation: "verified", approval: "approved" }),
    makeRecord({ id: "rec-003", emp: employees[3], month: prevM, year: prevY, sick: [11, 12], validation: "manual_review", approval: "pending" }),
    makeRecord({ id: "rec-004", emp: employees[4], month: curM, year: curY, annual: [2], validation: "verified", approval: "approved" }),
    makeRecord({ id: "rec-005", emp: employees[7], month: curM, year: curY, remote: [7, 8, 9], validation: "manual_review", approval: "pending" }),
  ];

  const vaultFiles: VaultFileSeed[] = [];
  for (const t of [
    { emp: employees[1], m: prevM, y: prevY },
    { emp: employees[5], m: prevM, y: prevY },
    { emp: employees[4], m: curM, y: curY },
    { emp: employees[7], m: curM, y: curY },
    { emp: employees[0], m: prevM, y: prevY },
  ]) {
    const monthLabel = `${MONTHS_LONG[t.m]} ${t.y}`;
    const pdfKey = `ts-${t.emp.id}-${t.y}-${t.m}`;
    vaultFiles.push({
      name: `${t.emp.name.replace(/\s+/g, "_")}_TS.pdf`,
      rel_path: `${t.emp.account_manager}/${t.emp.name}/${monthLabel}/${t.emp.name.replace(/\s+/g, "_")}_TS.pdf`,
      size: pdfs[pdfKey]?.length ?? 2000, content_type: "application/pdf", stored_at: isoDaysAgo(4), pdfKey,
    });
  }

  return {
    users, portalUsers, employees, emails, pipeline, records, vaultFiles,
    calendars: [
      { id: "cal-001", month: curM, year: curY, weekend_weekdays: ["Friday", "Saturday"], public_holidays: [{ date: dateInMonth(curY, curM, Math.min(15, daysInMonth(curY, curM))), name: "Demo Holiday" }], created_at: isoDaysAgo(30), updated_at: isoDaysAgo(30) },
      { id: "cal-002", month: prevM, year: prevY, weekend_weekdays: ["Friday", "Saturday"], public_holidays: [], created_at: isoDaysAgo(60), updated_at: isoDaysAgo(60) },
    ],
    reminderConfig: { auto_send_enabled: true, email_preference: "work", send_day: 28, send_hour_uae: 9, updated_at: isoDaysAgo(10), updated_by: "admin", scheduled_check_enabled: true, sending_enabled: true },
    reminderRuns: [{
      id: "rrun-001", trigger: "manual_batch", month: curM, year: curY, started_at: isoDaysAgo(7), finished_at: isoDaysAgo(7),
      total: 3, sent_count: 2, failed_count: 0, skipped_count: 1, triggered_by: "admin",
      logs: [
        { id: "rlog-001", run_id: "rrun-001", employee_pk: "emp-007", employee_id: "E1007", employee_name: "Mei Ling", recipient_email: "mei.ling@demo.local", month: curM, year: curY, trigger: "manual_batch", status: "sent", error: null, sent_at: isoDaysAgo(7), created_at: isoDaysAgo(7) },
        { id: "rlog-002", run_id: "rrun-001", employee_pk: "emp-008", employee_id: "E1008", employee_name: "Carlos Mendes", recipient_email: "carlos.mendes@demo.local", month: curM, year: curY, trigger: "manual_batch", status: "sent", error: null, sent_at: isoDaysAgo(7), created_at: isoDaysAgo(7) },
      ],
    }],
    systemNotice: { message: "Welcome to the Timesheets demo — no backend required.", enabled: true, updated_at: isoDaysAgo(1), updated_by: "admin" },
    chatAccess: { enabled_for_others: true, updated_at: isoDaysAgo(5), updated_by: "admin" },
    aiStatus: [
      { kind: "extraction", label: "Extract Email / Upload", provider: "demo", model: "demo-gpt-vision", has_key: true, note: "Mock — no real LLM calls" },
      { kind: "agent", label: "Ask AI", provider: "demo", model: "demo-gpt", has_key: true, note: "Mock canned replies" },
    ],
    systemHealth: [
      { component: "llm", status: "ok", detail: "Demo mode — LLM mocked", last_checked_at: isoDaysAgo(0), last_ok_at: isoDaysAgo(0), last_alert_sent_at: null },
      { component: "graph", status: "ok", detail: "Demo mode — mailbox mocked", last_checked_at: isoDaysAgo(0), last_ok_at: isoDaysAgo(0), last_alert_sent_at: null },
    ],
    portalSubmissions: [
      {
        id: "psub-001", employee_pk: "emp-001", employee_name: "Aisha Rahman", employee_id: "E1001",
        month: curM, year: curY, status: "draft", manager_decision: "pending", manager_note: null, decided_at: null,
        approval_claimed: false, employee_note: "Working on draft", extraction_state: "not_started", extraction_error: null,
        review_state: null, record_id: null, submitted_at: null, created_at: isoDaysAgo(2), updated_at: isoDaysAgo(1),
        files: [{ id: "psfile-001", kind: "timesheet", filename: "draft_aisha.pdf", content_type: "application/pdf", size_bytes: 4000, created_at: isoDaysAgo(1), pdfKey: `ts-emp-001-${curY}-${curM}` }],
        pipeline_files: [],
      },
      {
        id: "psub-002", employee_pk: "emp-001", employee_name: "Aisha Rahman", employee_id: "E1001",
        month: prevM, year: prevY, status: "submitted", manager_decision: "pending", manager_note: null, decided_at: null,
        approval_claimed: true, employee_note: "Submitted via portal", extraction_state: "done", extraction_error: null,
        review_state: "needs_review", record_id: null, submitted_at: isoDaysAgo(1), created_at: isoDaysAgo(3), updated_at: isoDaysAgo(1),
        files: [{ id: "psfile-002", kind: "timesheet", filename: "portal_aisha_ts.pdf", content_type: "application/pdf", size_bytes: 4000, created_at: isoDaysAgo(1), pdfKey: `ts-emp-001-${prevY}-${prevM}` }],
        pipeline_files: [{ kind: "timesheet", pipeline_file_id: "pipe-008", pipeline_status: "needs_review", record_id: null }],
      },
    ],
    debugRuns: [
      {
        id: "debug-001", created_at: isoDaysAgo(4), source_kind: "email", source_id: "msg-002", thread_key: "conv-002",
        subject: emails[2].subject, model: "demo-gpt", calls: 2, reused_sheets: 0, n_pass1_calls: 1, n_pass2_calls: 1,
        n_dropped: 0, n_sheets: 1, n_errors: 0,
        pass1_calls: [{ label: "pass1", model: "demo-gpt", system_prompt: "Classify thread attachments", user_text: "Thread subject + bodies", image_count: 1, response_json: { confirmed: ["Omar_Hassan_TS.pdf"], dropped: [] } }],
        pass2_calls: [{ label: "pass2", model: "demo-gpt", system_prompt: "Extract leave buckets", user_text: "Omar_Hassan_TS.pdf", image_count: 1, response_json: { employee: "Omar Hassan", month: prevM, year: prevY } }],
        dropped_items: [], triage: [{ name: "Omar_Hassan_TS.pdf", kind: "timesheet" }], sheets: [{ filename: "Omar_Hassan_TS.pdf", employee: "Omar Hassan" }], errors: [],
      },
      {
        id: "debug-002", created_at: isoDaysAgo(1), source_kind: "email", source_id: "msg-001", thread_key: "conv-001",
        subject: emails[0].subject, model: "demo-gpt", calls: 2, reused_sheets: 0, n_pass1_calls: 1, n_pass2_calls: 1,
        n_dropped: 1, n_sheets: 1, n_errors: 0,
        pass1_calls: [{ label: "pass1", model: "demo-gpt", system_prompt: "Classify", user_text: "...", image_count: 2, response_json: { confirmed: ["Aisha_Rahman_TS.pdf"], dropped: ["approval.png"] } }],
        pass2_calls: [{ label: "pass2", model: "demo-gpt", system_prompt: "Extract", user_text: "Aisha_Rahman_TS.pdf", image_count: 1, response_json: { employee: "Aisha Rahman" } }],
        dropped_items: [{ name: "approval.png", reason: "Not a timesheet", filter: "pass1", size: 1800, mime: "image/png", msg_index: 0, thumb: null, image_path: null }],
        triage: [], sheets: [{ filename: "Aisha_Rahman_TS.pdf" }], errors: [],
      },
    ],
    autoExtract: { state: "idle", total: 0, processed: 0, succeeded: 0, failed: 0, skipped: 0, current: null, started_at: null, finished_at: null, last_error: null, enabled: false },
    pdfs,
  };
}
