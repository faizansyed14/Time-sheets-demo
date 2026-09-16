"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// mock/vercel-mock-entry.ts
var vercel_mock_entry_exports = {};
__export(vercel_mock_entry_exports, {
  config: () => config,
  default: () => handler
});
module.exports = __toCommonJS(vercel_mock_entry_exports);

// mock/pdf.ts
var MONTHS = [
  "",
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December"
];
function esc(s) {
  return s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}
function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}
function dateIso(year, month, day) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
function buildAttendance(year, month, opts) {
  const nDays = daysInMonth(year, month);
  const annualWant = new Set(opts?.annualLeave ?? [3, 4]);
  const sickWant = new Set(opts?.sickLeave ?? []);
  const remoteWant = new Set(opts?.remoteWork ?? [8, 9]);
  const annual_leave = [];
  const sick_leave = [];
  const remote_work = [];
  const working_days = [];
  const weekend_days = [];
  for (let day = 1; day <= nDays; day++) {
    const iso = dateIso(year, month, day);
    const dow = new Date(year, month - 1, day).getDay();
    if (dow === 0 || dow === 6) {
      weekend_days.push(iso);
      continue;
    }
    if (annualWant.has(day)) annual_leave.push(iso);
    else if (sickWant.has(day)) sick_leave.push(iso);
    else if (remoteWant.has(day)) remote_work.push(iso);
    else working_days.push(iso);
  }
  return { annual_leave, sick_leave, remote_work, working_days, weekend_days, calendar_days: nDays };
}
function stagedFromAttendance(year, month, emp, opts, flags = []) {
  const a = buildAttendance(year, month, opts);
  return {
    employee_pk: emp?.id ?? null,
    matched_name: emp?.name ?? null,
    matched_employee_id: emp?.employee_id ?? null,
    month,
    year,
    // Short keys match leaveBucketDefs() / Compare & Fix form (annual, sick, …)
    buckets: {
      annual: a.annual_leave,
      sick: a.sick_leave,
      remote: a.remote_work,
      maternity: [],
      unpaid: [],
      absent: [],
      public_holiday: [],
      other: []
    },
    working_days: a.working_days,
    weekend_days: a.weekend_days,
    flags,
    auto_accept: !!emp && flags.length === 0
  };
}
function text(x, y, size, s, font = "/F1") {
  return `BT ${font} ${size} Tf ${x.toFixed(1)} ${y.toFixed(1)} Td (${esc(s)}) Tj ET`;
}
function rect(x, y, w, h, fill = false) {
  return `${x.toFixed(1)} ${y.toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)} re ${fill ? "f" : "S"}`;
}
function gray(g) {
  return `${g.toFixed(3)} g`;
}
function strokeGray(g) {
  return `${g.toFixed(3)} G`;
}
function buildPdfFromContent(stream, pageW = 612, pageH = 792) {
  const objects = [];
  objects.push("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
  objects.push("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n");
  objects.push(
    `3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>
endobj
`
  );
  objects.push(`4 0 obj
<< /Length ${Buffer.byteLength(stream, "utf8")} >>
stream
${stream}
endstream
endobj
`);
  objects.push("5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n");
  objects.push("6 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n");
  let pdf = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
  const offsets = [0];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf, "binary"));
    pdf += obj;
  }
  const xrefStart = Buffer.byteLength(pdf, "binary");
  pdf += `xref
0 ${objects.length + 1}
`;
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i <= objects.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n 
`;
  }
  pdf += `trailer
<< /Size ${objects.length + 1} /Root 1 0 R >>
`;
  pdf += `startxref
${xrefStart}
%%EOF
`;
  return Buffer.from(pdf, "binary");
}
function makeTimesheetPdf(employeeName, month, year, opts) {
  const period = `${MONTHS[month] || month} ${year}`;
  const attendance = buildAttendance(year, month, opts);
  const annual = new Set(attendance.annual_leave.map((d) => Number(d.slice(-2))));
  const sick = new Set(attendance.sick_leave.map((d) => Number(d.slice(-2))));
  const remote = new Set(attendance.remote_work.map((d) => Number(d.slice(-2))));
  const weekends = new Set(attendance.weekend_days.map((d) => Number(d.slice(-2))));
  const nDays = attendance.calendar_days;
  const empId = opts?.employeeId || "E1000";
  const project = opts?.project || "Demo Project";
  const manager = opts?.manager || "Account Manager";
  const cmds = [];
  cmds.push(strokeGray(0.25));
  cmds.push("1 w");
  cmds.push(gray(0.12));
  cmds.push(rect(36, 742, 540, 36, true));
  cmds.push(gray(1));
  cmds.push(text(48, 754, 14, "TIMESHEET PORTAL \u2014 Monthly Attendance", "/F2"));
  cmds.push(gray(0));
  cmds.push(text(48, 720, 11, `Period: ${period}`, "/F2"));
  cmds.push(text(320, 720, 10, `Generated: ${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}`));
  cmds.push(strokeGray(0.55));
  cmds.push(rect(36, 640, 540, 68, false));
  cmds.push(text(48, 690, 10, "Employee", "/F2"));
  cmds.push(text(48, 674, 11, employeeName));
  cmds.push(text(48, 658, 9, `ID: ${empId}`));
  cmds.push(text(260, 690, 10, "Project", "/F2"));
  cmds.push(text(260, 674, 10, project));
  cmds.push(text(260, 658, 9, `Manager: ${manager}`));
  cmds.push(text(460, 690, 10, "Location", "/F2"));
  cmds.push(text(460, 674, 10, "UAE"));
  cmds.push(text(48, 622, 9, "Legend:  W = Working   AL = Annual Leave   SL = Sick   RW = Remote   WE = Weekend", "/F1"));
  const gridTop = 600;
  const cellW = 72;
  const cellH = 28;
  const cols = 7;
  const startX = 54;
  const labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  for (let c = 0; c < cols; c++) {
    const x = startX + c * cellW;
    cmds.push(gray(0.92));
    cmds.push(rect(x, gridTop - cellH, cellW, cellH, true));
    cmds.push(gray(0));
    cmds.push(strokeGray(0.5));
    cmds.push(rect(x, gridTop - cellH, cellW, cellH, false));
    cmds.push(text(x + 22, gridTop - 18, 9, labels[c], "/F2"));
  }
  const firstDow = new Date(year, month - 1, 1).getDay();
  let day = 1;
  let row = 1;
  let col = firstDow;
  let work = 0, al = 0, sl = 0, rw = 0, we = 0;
  while (day <= nDays) {
    const x = startX + col * cellW;
    const y = gridTop - (row + 1) * cellH;
    let code = "W";
    let fill = null;
    if (weekends.has(day)) {
      code = "WE";
      fill = 0.88;
      we++;
    } else if (annual.has(day)) {
      code = "AL";
      fill = 0.85;
      al++;
    } else if (sick.has(day)) {
      code = "SL";
      fill = 0.8;
      sl++;
    } else if (remote.has(day)) {
      code = "RW";
      fill = 0.9;
      rw++;
    } else {
      work++;
    }
    if (fill != null) {
      cmds.push(gray(fill));
      cmds.push(rect(x, y, cellW, cellH, true));
    }
    cmds.push(gray(0));
    cmds.push(strokeGray(0.55));
    cmds.push(rect(x, y, cellW, cellH, false));
    cmds.push(text(x + 6, y + 16, 8, String(day), "/F2"));
    cmds.push(text(x + 28, y + 8, 9, code));
    day++;
    col++;
    if (col >= 7) {
      col = 0;
      row++;
    }
  }
  const summaryY = gridTop - (row + 2) * cellH - 20;
  cmds.push(text(48, summaryY, 10, "Summary", "/F2"));
  cmds.push(text(48, summaryY - 16, 9, `Working days: ${work}`));
  cmds.push(text(180, summaryY - 16, 9, `Annual leave: ${al}`));
  cmds.push(text(320, summaryY - 16, 9, `Sick leave: ${sl}`));
  cmds.push(text(440, summaryY - 16, 9, `Remote: ${rw}`));
  cmds.push(text(48, summaryY - 32, 9, `Weekends: ${we}    Calendar days: ${nDays}`));
  const sigY = Math.max(80, summaryY - 90);
  cmds.push(strokeGray(0.4));
  cmds.push(rect(36, sigY - 10, 540, 56, false));
  cmds.push(text(48, sigY + 30, 10, "Employee declaration", "/F2"));
  cmds.push(text(48, sigY + 14, 8, `I confirm the attendance above for ${period} is accurate.`));
  cmds.push(text(48, sigY - 2, 9, `Signed: ${employeeName}`));
  cmds.push(text(320, sigY - 2, 9, `Manager approval: ${manager}`));
  cmds.push(text(48, 48, 7, "Demo timesheet PDF \u2014 Timesheets tool demo (frontend mock)"));
  return buildPdfFromContent(cmds.join("\n"));
}
function makeApprovalPng(label = "APPROVED") {
  const w = 240;
  const h = 80;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    const row = y * (w * 3 + 1);
    raw[row] = 0;
    for (let x = 0; x < w; x++) {
      const i = row + 1 + x * 3;
      const border = x < 3 || x >= w - 3 || y < 3 || y >= h - 3;
      if (border) {
        raw[i] = 6;
        raw[i + 1] = 95;
        raw[i + 2] = 70;
      } else {
        raw[i] = 16;
        raw[i + 1] = 185;
        raw[i + 2] = 129;
      }
    }
  }
  const chars = label.toUpperCase().slice(0, 12);
  for (let y = 28; y < 52; y++) {
    for (let x = 40; x < 200; x++) {
      const on = Math.floor((x - 40) / 12) < chars.length && (x - 40) % 12 > 2 && (x - 40) % 12 < 9 && (y - 28) % 24 > 3 && (y - 28) % 24 < 20;
      if (on) {
        const row = y * (w * 3 + 1);
        const i = row + 1 + x * 3;
        raw[i] = 255;
        raw[i + 1] = 255;
        raw[i + 2] = 255;
      }
    }
  }
  function crc32(buf) {
    let c = ~0;
    for (let i = 0; i < buf.length; i++) {
      c ^= buf[i];
      for (let k = 0; k < 8; k++) c = c >>> 1 ^ 3988292384 & -(c & 1);
    }
    return ~c >>> 0;
  }
  function chunk(type, data) {
    const typeBuf = Buffer.from(type, "ascii");
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const crcBuf = Buffer.concat([typeBuf, data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(crcBuf), 0);
    return Buffer.concat([len, typeBuf, data, crc]);
  }
  function zlibStore(data) {
    const blocks = [];
    let offset = 0;
    while (offset < data.length) {
      const size = Math.min(65535, data.length - offset);
      const isLast = offset + size >= data.length;
      const header = Buffer.alloc(5);
      header[0] = isLast ? 1 : 0;
      header.writeUInt16LE(size, 1);
      header.writeUInt16LE(size ^ 65535, 3);
      blocks.push(header, data.subarray(offset, offset + size));
      offset += size;
    }
    const adler = adler32(data);
    const adlerBuf = Buffer.alloc(4);
    adlerBuf.writeUInt32BE(adler, 0);
    return Buffer.concat([Buffer.from([120, 1]), ...blocks, adlerBuf]);
  }
  function adler32(data) {
    let a = 1, b = 0;
    for (let i = 0; i < data.length; i++) {
      a = (a + data[i]) % 65521;
      b = (b + a) % 65521;
    }
    return (b << 16 | a) >>> 0;
  }
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const idat = zlibStore(raw);
  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

// mock/seed.ts
var MONTHS_LONG = [
  "",
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December"
];
function currentPeriod() {
  const now = /* @__PURE__ */ new Date();
  return { month: now.getMonth() + 1, year: now.getFullYear() };
}
function isoDaysAgo(n) {
  const d = /* @__PURE__ */ new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}
function dateInMonth(year, month, day) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
function daysInMonth2(year, month) {
  return new Date(year, month, 0).getDate();
}
function weekendDates(year, month) {
  const out = [];
  const n = daysInMonth2(year, month);
  for (let d = 1; d <= n; d++) {
    const wd = new Date(year, month - 1, d).getDay();
    if (wd === 0 || wd === 6) out.push(dateInMonth(year, month, d));
  }
  return out;
}
function p(text2) {
  return "<p>" + text2 + "</p>";
}
function makeRecord(opts) {
  const { emp, month, year } = opts;
  const weekends = weekendDates(year, month);
  const annual = (opts.annual ?? []).map((d) => dateInMonth(year, month, d));
  const sick = (opts.sick ?? []).map((d) => dateInMonth(year, month, d));
  const remote = (opts.remote ?? []).map((d) => dateInMonth(year, month, d));
  const leaveSet = /* @__PURE__ */ new Set([...annual, ...sick, ...remote, ...weekends]);
  const n = daysInMonth2(year, month);
  const working = [];
  for (let d = 1; d <= n; d++) {
    const s = dateInMonth(year, month, d);
    if (!leaveSet.has(s)) working.push(s);
  }
  const folder = `${emp.account_manager}/${emp.name}/${MONTHS_LONG[month]} ${year}`;
  return {
    id: opts.id,
    matched_employee_pk: emp.id,
    employee_id: emp.employee_id,
    employee_name: emp.name,
    account_manager: emp.account_manager,
    dco_number: emp.dco_number,
    match_note: "Matched by work email",
    month,
    year,
    calendar_days: n,
    annual_leave_dates: annual,
    remote_work_dates: remote,
    sick_leave_dates: sick,
    maternity_leave_dates: [],
    unpaid_leave_dates: [],
    absent_dates: [],
    public_holiday_dates: [],
    other_leave_dates: [],
    working_dates: working,
    weekend_dates: weekends,
    annual_leave_count: annual.length,
    remote_work_count: remote.length,
    sick_leave_count: sick.length,
    maternity_leave_count: 0,
    unpaid_leave_count: 0,
    absent_count: 0,
    public_holiday_count: 0,
    other_leave_count: 0,
    working_dates_count: working.length,
    weekend_dates_count: weekends.length,
    validation_status: opts.validation ?? "verified",
    llm_summary: `Timesheet for ${emp.name} \u2014 ${MONTHS_LONG[month]} ${year}`,
    hr_flags: [],
    approval_detected: (opts.approval ?? "approved") === "approved",
    approval_detail: (opts.approval ?? "approved") === "approved" ? "Manager approved via email" : null,
    approval_status: opts.approval ?? "approved",
    source_email_id: opts.emailId ?? null,
    storage_folder: folder,
    source_files: [{
      key: `${folder}/timesheet.pdf`,
      filename: `${emp.name.replace(/\s+/g, "_")}_TS.pdf`,
      source_id: opts.emailId ?? null,
      attachment_id: null,
      ingested_at: isoDaysAgo(3),
      buckets: { annual_leave: annual, sick_leave: sick, remote_work: remote }
    }],
    source_file_count: 1
  };
}
function buildSeed() {
  const { month: curM, year: curY } = currentPeriod();
  const prevM = curM === 1 ? 12 : curM - 1;
  const prevY = curM === 1 ? curY - 1 : curY;
  const users = [
    { id: "user-admin", username: "admin", password: "admin", email: "admin@demo.local", role: "admin", auth_mode: "captcha", is_active: true, last_login_at: isoDaysAgo(0), last_seen_at: isoDaysAgo(0), online: true },
    { id: "user-user", username: "user", password: "user", email: "user@demo.local", role: "user", auth_mode: "captcha", is_active: true, last_login_at: isoDaysAgo(1), last_seen_at: isoDaysAgo(1), online: false },
    { id: "user-viewer", username: "viewer", password: "viewer", email: "viewer@demo.local", role: "viewer", auth_mode: "captcha", is_active: true, last_login_at: isoDaysAgo(2), last_seen_at: isoDaysAgo(2), online: false },
    { id: "user-vault", username: "vault", password: "vault", email: "vault@demo.local", role: "vault_matcher", auth_mode: "captcha", is_active: true, last_login_at: isoDaysAgo(2), last_seen_at: isoDaysAgo(2), online: false }
  ];
  const employees = [
    { id: "emp-001", employee_id: "E1001", name: "Aisha Rahman", aco_number: "ACO-101", dco_number: "DCO-201", account_manager: "Sarah Chen", employee_email_id: "aisha.rahman@demo.local", project: "ADNOC Digitization", contact_no: "+971501000001", location: "Dubai", work_email: "aisha.rahman@demo.local", personal_email: "aisha.r@mail.com", active: true },
    { id: "emp-002", employee_id: "E1002", name: "Omar Hassan", aco_number: "ACO-102", dco_number: "DCO-202", account_manager: "Sarah Chen", employee_email_id: "omar.hassan@demo.local", project: "ADNOC Digitization", contact_no: "+971501000002", location: "Dubai", work_email: "omar.hassan@demo.local", personal_email: "omar.h@mail.com", active: true },
    { id: "emp-003", employee_id: "E1003", name: "Priya Nair", aco_number: "ACO-103", dco_number: "DCO-203", account_manager: "Sarah Chen", employee_email_id: "priya.nair@demo.local", project: "Etisalat Support", contact_no: "+971501000003", location: "Abu Dhabi", work_email: "priya.nair@demo.local", personal_email: "priya.n@mail.com", active: true },
    { id: "emp-004", employee_id: "E1004", name: "Daniel Okoro", aco_number: "ACO-104", dco_number: "DCO-204", account_manager: "Sarah Chen", employee_email_id: "daniel.okoro@demo.local", project: "Etisalat Support", contact_no: "+971501000004", location: "Dubai", work_email: "daniel.okoro@demo.local", personal_email: "daniel.o@mail.com", active: true },
    { id: "emp-005", employee_id: "E1005", name: "Fatima Al Marri", aco_number: "ACO-105", dco_number: "DCO-205", account_manager: "James Okonkwo", employee_email_id: "fatima.almarri@demo.local", project: "Masdar Green", contact_no: "+971501000005", location: "Abu Dhabi", work_email: "fatima.almarri@demo.local", personal_email: "fatima.a@mail.com", active: true },
    { id: "emp-006", employee_id: "E1006", name: "Liam Walsh", aco_number: "ACO-106", dco_number: "DCO-206", account_manager: "James Okonkwo", employee_email_id: "liam.walsh@demo.local", project: "Masdar Green", contact_no: "+971501000006", location: "Abu Dhabi", work_email: "liam.walsh@demo.local", personal_email: "liam.w@mail.com", active: true },
    { id: "emp-007", employee_id: "E1007", name: "Mei Ling", aco_number: "ACO-107", dco_number: "DCO-207", account_manager: "James Okonkwo", employee_email_id: "mei.ling@demo.local", project: "Dubai Metro Ops", contact_no: "+971501000007", location: "Dubai", work_email: "mei.ling@demo.local", personal_email: "mei.l@mail.com", active: true },
    { id: "emp-008", employee_id: "E1008", name: "Carlos Mendes", aco_number: "ACO-108", dco_number: "DCO-208", account_manager: "James Okonkwo", employee_email_id: "carlos.mendes@demo.local", project: "Dubai Metro Ops", contact_no: "+971501000008", location: "Dubai", work_email: "carlos.mendes@demo.local", personal_email: "carlos.m@mail.com", active: true }
  ];
  const portalUsers = [{
    id: "portal-001",
    username: "employee1",
    password: "portal123",
    role: "employee",
    employee_pk: "emp-001",
    employee_name: "Aisha Rahman",
    employee_id: "E1001",
    is_active: true,
    last_login_at: isoDaysAgo(2)
  }];
  const leaveCur = (empId) => {
    if (empId === "emp-003") return { annualLeave: [10, 11], sickLeave: [18], remoteWork: [] };
    if (empId === "emp-005") return { annualLeave: [2], sickLeave: [], remoteWork: [14, 15] };
    return { annualLeave: [3, 4], sickLeave: [], remoteWork: [8, 9] };
  };
  const leavePrev = (empId) => {
    if (empId === "emp-002") return { annualLeave: [3, 4], sickLeave: [14], remoteWork: [] };
    if (empId === "emp-001") return { annualLeave: [3, 4], sickLeave: [], remoteWork: [20] };
    return { annualLeave: [3, 4], sickLeave: [], remoteWork: [20] };
  };
  const pdfs = {};
  for (const emp of employees) {
    const cur = leaveCur(emp.id);
    const prev = leavePrev(emp.id);
    pdfs[`ts-${emp.id}-${curY}-${curM}`] = makeTimesheetPdf(emp.name, curM, curY, {
      employeeId: emp.employee_id,
      project: emp.project || "Project",
      manager: emp.account_manager || "Manager",
      ...cur
    });
    pdfs[`ts-${emp.id}-${prevY}-${prevM}`] = makeTimesheetPdf(emp.name, prevM, prevY, {
      employeeId: emp.employee_id,
      project: emp.project || "Project",
      manager: emp.account_manager || "Manager",
      ...prev
    });
  }
  pdfs["approval-001"] = makeApprovalPng("APPROVED");
  pdfs["generic"] = makeTimesheetPdf("Demo Employee", curM, curY, {
    employeeId: "E0000",
    project: "Demo Project",
    manager: "Sarah Chen",
    annualLeave: [3, 4],
    remoteWork: [8, 9],
    sickLeave: []
  });
  const tsSize = (key) => pdfs[key]?.length ?? 8e3;
  const emails = [
    {
      id: "msg-001",
      provider_message_id: "graph-001",
      sender_name: "Aisha Rahman",
      sender_email: "aisha.rahman@demo.local",
      subject: `Timesheet \u2014 ${MONTHS_LONG[curM]} ${curY}`,
      received_at: isoDaysAgo(1),
      status: "new",
      attachment_count: 2,
      has_approval_screenshot: true,
      extract_email_at: null,
      no_sheets_found_at: null,
      no_sheets_note: null,
      conversation_id: "conv-001",
      thread_id: "msg-001",
      thread_message_count: 2,
      body_text: "Please find my timesheet attached for review.",
      body_html: p("Please find my timesheet attached for review."),
      to_recipients: [{ name: "Sarah Chen", email: "sarah.chen@demo.local" }],
      cc_recipients: [],
      inline_attachment_ids: [],
      attachments: [
        { attachment_id: "att-001a", filename: "Aisha_Rahman_TS.pdf", content_type: "application/pdf", kind: "timesheet", size: tsSize(`ts-emp-001-${curY}-${curM}`), pdfKey: `ts-emp-001-${curY}-${curM}` },
        { attachment_id: "att-001b", filename: "approval.png", content_type: "image/png", kind: "approval_screenshot", size: pdfs["approval-001"].length, pdfKey: "approval-001" }
      ],
      summary: { headline: "Aisha submitted timesheet awaiting review", status: "sheet_submitted", narrative: "Employee sent timesheet PDF with approval screenshot.", timesheet_sent: true, approval_requested: false, approval_given: true, period: `${MONTHS_LONG[curM]} ${curY}`, employee: "Aisha Rahman", action_needed: "Review in pipeline", message_count: 2, model: "demo-gpt", at: isoDaysAgo(1) },
      extracted_sheets: [],
      extracted_at: null
    },
    {
      id: "msg-001b",
      provider_message_id: "graph-001b",
      sender_name: "Sarah Chen",
      sender_email: "sarah.chen@demo.local",
      subject: `Re: Timesheet \u2014 ${MONTHS_LONG[curM]} ${curY}`,
      received_at: isoDaysAgo(0),
      status: "new",
      attachment_count: 0,
      has_approval_screenshot: false,
      extract_email_at: null,
      no_sheets_found_at: null,
      no_sheets_note: null,
      conversation_id: "conv-001",
      thread_id: "msg-001",
      thread_message_count: 2,
      body_text: "Thanks Aisha, I will review shortly.",
      body_html: p("Thanks Aisha, I will review shortly."),
      to_recipients: [{ name: "Aisha Rahman", email: "aisha.rahman@demo.local" }],
      cc_recipients: [],
      inline_attachment_ids: [],
      attachments: []
    },
    {
      id: "msg-002",
      provider_message_id: "graph-002",
      sender_name: "Omar Hassan",
      sender_email: "omar.hassan@demo.local",
      subject: `TS ${MONTHS_LONG[prevM]} ${prevY} \u2014 Omar`,
      received_at: isoDaysAgo(5),
      status: "new",
      attachment_count: 1,
      has_approval_screenshot: false,
      extract_email_at: isoDaysAgo(4),
      no_sheets_found_at: null,
      no_sheets_note: null,
      conversation_id: "conv-002",
      thread_id: "msg-002",
      thread_message_count: 1,
      body_text: "Attached timesheet for last month.",
      body_html: p("Attached timesheet for last month."),
      to_recipients: [{ name: "Timesheets", email: "timesheets@demo.local" }],
      cc_recipients: [],
      inline_attachment_ids: [],
      attachments: [{ attachment_id: "att-002a", filename: "Omar_Hassan_TS.pdf", content_type: "application/pdf", kind: "timesheet", size: tsSize(`ts-emp-002-${prevY}-${prevM}`), pdfKey: `ts-emp-002-${prevY}-${prevM}` }],
      extracted_filenames: ["Omar_Hassan_TS.pdf"],
      extracted_sheets: ["Omar_Hassan_TS.pdf"],
      extracted_at: isoDaysAgo(4),
      summary: { headline: "Omar prior-month sheet already extracted", status: "approved", narrative: "Sheet extracted and staged previously.", timesheet_sent: true, approval_requested: false, approval_given: true, period: `${MONTHS_LONG[prevM]} ${prevY}`, employee: "Omar Hassan", action_needed: "None", message_count: 1, model: "demo-gpt", at: isoDaysAgo(4) }
    },
    {
      id: "msg-003",
      provider_message_id: "graph-003",
      sender_name: "Priya Nair",
      sender_email: "priya.nair@demo.local",
      subject: `Timesheet ${MONTHS_LONG[curM]} \u2014 Priya`,
      received_at: isoDaysAgo(2),
      status: "new",
      attachment_count: 1,
      has_approval_screenshot: false,
      extract_email_at: null,
      no_sheets_found_at: null,
      no_sheets_note: null,
      conversation_id: "conv-003",
      thread_id: "msg-003",
      thread_message_count: 1,
      body_text: "Please process my timesheet.",
      body_html: p("Please process my timesheet."),
      to_recipients: [{ name: "Timesheets", email: "timesheets@demo.local" }],
      cc_recipients: [],
      inline_attachment_ids: [],
      attachments: [{ attachment_id: "att-003a", filename: "Priya_Nair_TS.pdf", content_type: "application/pdf", kind: "timesheet", size: 4100, pdfKey: `ts-emp-003-${curY}-${curM}` }],
      summary: { headline: "Priya submitted current month timesheet", status: "awaiting_approval", narrative: "Sheet attached, no approval screenshot yet.", timesheet_sent: true, approval_requested: true, approval_given: false, period: `${MONTHS_LONG[curM]} ${curY}`, employee: "Priya Nair", action_needed: "Extract and review", message_count: 1, model: "demo-gpt", at: isoDaysAgo(2) }
    },
    {
      id: "msg-004",
      provider_message_id: "graph-004",
      sender_name: "Fatima Al Marri",
      sender_email: "fatima.almarri@demo.local",
      subject: "FW: Timesheet + leave note",
      received_at: isoDaysAgo(3),
      status: "new",
      attachment_count: 2,
      has_approval_screenshot: true,
      extract_email_at: null,
      no_sheets_found_at: null,
      no_sheets_note: null,
      conversation_id: "conv-004",
      thread_id: "msg-004",
      thread_message_count: 1,
      body_text: "Forwarding my sheet with sick leave note.",
      body_html: p("Forwarding my sheet with sick leave note."),
      to_recipients: [{ name: "James Okonkwo", email: "james.okonkwo@demo.local" }],
      cc_recipients: [],
      inline_attachment_ids: [],
      attachments: [
        { attachment_id: "att-004a", filename: "Fatima_TS.pdf", content_type: "application/pdf", kind: "timesheet", size: 4e3, pdfKey: `ts-emp-005-${curY}-${curM}` },
        { attachment_id: "att-004b", filename: "mgr_ok.png", content_type: "image/png", kind: "approval_screenshot", size: 1600, pdfKey: "approval-001" }
      ]
    },
    {
      id: "msg-005",
      provider_message_id: "graph-005",
      sender_name: "Unknown Sender",
      sender_email: "contractor@external.com",
      subject: "Timesheet from contractor",
      received_at: isoDaysAgo(6),
      status: "new",
      attachment_count: 1,
      has_approval_screenshot: false,
      extract_email_at: null,
      no_sheets_found_at: null,
      no_sheets_note: null,
      conversation_id: "conv-005",
      thread_id: "msg-005",
      thread_message_count: 1,
      body_text: "Please find attached.",
      body_html: p("Please find attached."),
      to_recipients: [{ name: "Timesheets", email: "timesheets@demo.local" }],
      cc_recipients: [],
      inline_attachment_ids: [],
      attachments: [{ attachment_id: "att-005a", filename: "unknown_sheet.pdf", content_type: "application/pdf", kind: "timesheet", size: 3500, pdfKey: "generic" }]
    },
    {
      id: "msg-006",
      provider_message_id: "graph-006",
      sender_name: "Mei Ling",
      sender_email: "mei.ling@demo.local",
      subject: "Old chase \u2014 timesheet?",
      received_at: isoDaysAgo(20),
      status: "archived",
      attachment_count: 0,
      has_approval_screenshot: false,
      extract_email_at: null,
      no_sheets_found_at: isoDaysAgo(19),
      no_sheets_note: "No attachments found",
      conversation_id: "conv-006",
      thread_id: "msg-006",
      thread_message_count: 1,
      body_text: "Just checking if you received my sheet last week?",
      body_html: p("Just checking if you received my sheet last week?"),
      to_recipients: [{ name: "Timesheets", email: "timesheets@demo.local" }],
      cc_recipients: [],
      inline_attachment_ids: [],
      attachments: [],
      summary: { headline: "Chase email \u2014 no sheet attached", status: "chasing", narrative: "Employee chasing prior submission; no attachment.", timesheet_sent: false, approval_requested: false, approval_given: false, period: "", employee: "Mei Ling", action_needed: "None", message_count: 1, model: "demo-gpt", at: isoDaysAgo(19) }
    }
  ];
  const pipeline = [
    {
      id: "pipe-001",
      filename: "Aisha_Rahman_TS.pdf",
      content_type: "application/pdf",
      size_bytes: tsSize(`ts-emp-001-${curY}-${curM}`),
      source_kind: "email",
      source_id: "graph-001",
      attachment_id: "att-001a",
      status: "needs_review",
      stage: "staged",
      failure_code: null,
      failure_label: null,
      failure_detail: null,
      events: [
        { stage: "ingest", status: "ok", detail: "Attachment saved", at: isoDaysAgo(1) },
        { stage: "extract", status: "ok", detail: "Vision extract OK", at: isoDaysAgo(1) },
        { stage: "match", status: "ok", detail: "Matched emp-001", at: isoDaysAgo(1) }
      ],
      employee_id: "E1001",
      employee_name: "Aisha Rahman",
      month: curM,
      year: curY,
      record_id: null,
      extraction_model: "demo-gpt",
      extraction_method: "vision",
      used_ocr: false,
      auto_accepted: true,
      can_retry: true,
      can_resolve_assign: true,
      resolved_at: null,
      resolution_note: null,
      created_at: isoDaysAgo(1),
      updated_at: isoDaysAgo(1),
      pdfKey: `ts-emp-001-${curY}-${curM}`,
      thread_key: "conv-001",
      extraction_meta: {
        staged: stagedFromAttendance(curY, curM, employees[0], leaveCur("emp-001")),
        full_email_extract: {
          approval: { detected: true, detail: "Manager approval screenshot attached (Sarah Chen)" },
          sheets: [{ filename: "Aisha_Rahman_TS.pdf", employee_name: "Aisha Rahman", employee_id: "E1001" }]
        },
        auto_accept: { accepted: true, confidence: "high", reasons: ["Employee matched", "Leave buckets complete", "Approval detected"], blockers: [] }
      }
    },
    {
      id: "pipe-002",
      filename: "Omar_Hassan_TS.pdf",
      content_type: "application/pdf",
      size_bytes: tsSize(`ts-emp-002-${prevY}-${prevM}`),
      source_kind: "email",
      source_id: "graph-002",
      attachment_id: "att-002a",
      status: "success",
      stage: "filed",
      failure_code: null,
      failure_label: null,
      failure_detail: null,
      events: [
        { stage: "ingest", status: "ok", detail: "OK", at: isoDaysAgo(5) },
        { stage: "extract", status: "ok", detail: "OK", at: isoDaysAgo(4) },
        { stage: "file", status: "ok", detail: "Filed rec-001", at: isoDaysAgo(4) }
      ],
      employee_id: "E1002",
      employee_name: "Omar Hassan",
      month: prevM,
      year: prevY,
      record_id: "rec-001",
      extraction_model: "demo-gpt",
      extraction_method: "vision",
      used_ocr: false,
      auto_accepted: false,
      can_retry: false,
      can_resolve_assign: false,
      resolved_at: null,
      resolution_note: null,
      created_at: isoDaysAgo(5),
      updated_at: isoDaysAgo(4),
      pdfKey: `ts-emp-002-${prevY}-${prevM}`,
      thread_key: "conv-002",
      extraction_meta: { staged: stagedFromAttendance(prevY, prevM, employees[1], leavePrev("emp-002")) }
    },
    {
      id: "pipe-003",
      filename: "Priya_Nair_TS.pdf",
      content_type: "application/pdf",
      size_bytes: tsSize(`ts-emp-003-${curY}-${curM}`),
      source_kind: "email",
      source_id: "graph-003",
      attachment_id: "att-003a",
      status: "needs_review",
      stage: "staged",
      failure_code: null,
      failure_label: null,
      failure_detail: null,
      events: [
        { stage: "ingest", status: "ok", detail: "OK", at: isoDaysAgo(2) },
        { stage: "extract", status: "ok", detail: "OK", at: isoDaysAgo(2) },
        { stage: "match", status: "ok", detail: "Matched", at: isoDaysAgo(2) }
      ],
      employee_id: "E1003",
      employee_name: "Priya Nair",
      month: curM,
      year: curY,
      record_id: null,
      extraction_model: "demo-gpt",
      extraction_method: "vision",
      used_ocr: false,
      auto_accepted: false,
      can_retry: true,
      can_resolve_assign: true,
      resolved_at: null,
      resolution_note: null,
      created_at: isoDaysAgo(2),
      updated_at: isoDaysAgo(2),
      pdfKey: `ts-emp-003-${curY}-${curM}`,
      thread_key: "conv-003",
      extraction_meta: {
        staged: stagedFromAttendance(curY, curM, employees[2], leaveCur("emp-003"), ["No approval screenshot"]),
        full_email_extract: {
          approval: { detected: false, detail: "" },
          sheets: [{ filename: "Priya_Nair_TS.pdf", employee_name: "Priya Nair", employee_id: "E1003" }]
        },
        auto_accept: { accepted: false, confidence: "low", reasons: [], blockers: ["No approval evidence"] }
      }
    },
    {
      id: "pipe-004",
      filename: "unknown_sheet.pdf",
      content_type: "application/pdf",
      size_bytes: tsSize("generic"),
      source_kind: "email",
      source_id: "graph-005",
      attachment_id: "att-005a",
      status: "needs_review",
      stage: "match",
      failure_code: "no_employee_match",
      failure_label: "Employee not matched",
      failure_detail: "Sender not in Employee Matcher",
      events: [
        { stage: "ingest", status: "ok", detail: "OK", at: isoDaysAgo(6) },
        { stage: "extract", status: "ok", detail: "OK", at: isoDaysAgo(6) },
        { stage: "match", status: "fail", detail: "No match", at: isoDaysAgo(6) }
      ],
      employee_id: null,
      employee_name: null,
      month: curM,
      year: curY,
      record_id: null,
      extraction_model: "demo-gpt",
      extraction_method: "vision",
      used_ocr: true,
      auto_accepted: false,
      can_retry: true,
      can_resolve_assign: true,
      resolved_at: null,
      resolution_note: null,
      created_at: isoDaysAgo(6),
      updated_at: isoDaysAgo(6),
      pdfKey: "generic",
      thread_key: "conv-005",
      extraction_meta: {
        staged: stagedFromAttendance(curY, curM, null, { annualLeave: [3, 4], remoteWork: [8, 9], sickLeave: [] }, ["Unmatched employee"])
      }
    },
    {
      id: "pipe-005",
      filename: "Fatima_TS.pdf",
      content_type: "application/pdf",
      size_bytes: tsSize(`ts-emp-005-${curY}-${curM}`),
      source_kind: "email",
      source_id: "graph-004",
      attachment_id: "att-004a",
      status: "failed",
      stage: "extract",
      failure_code: "extract_error",
      failure_label: "Extraction failed",
      failure_detail: "Demo: corrupted page image",
      events: [
        { stage: "ingest", status: "ok", detail: "OK", at: isoDaysAgo(3) },
        { stage: "extract", status: "fail", detail: "Vision error", at: isoDaysAgo(3) }
      ],
      employee_id: "E1005",
      employee_name: "Fatima Al Marri",
      month: curM,
      year: curY,
      record_id: null,
      extraction_model: "demo-gpt",
      extraction_method: "vision",
      used_ocr: true,
      auto_accepted: false,
      can_retry: true,
      can_resolve_assign: true,
      resolved_at: null,
      resolution_note: null,
      created_at: isoDaysAgo(3),
      updated_at: isoDaysAgo(3),
      pdfKey: `ts-emp-005-${curY}-${curM}`,
      thread_key: "conv-004",
      extraction_meta: null
    },
    {
      id: "pipe-006",
      filename: "upload_batch_mei.pdf",
      content_type: "application/pdf",
      size_bytes: tsSize(`ts-emp-007-${curY}-${curM}`),
      source_kind: "upload",
      source_id: null,
      attachment_id: null,
      status: "processing",
      stage: "extract",
      failure_code: null,
      failure_label: null,
      failure_detail: null,
      events: [{ stage: "ingest", status: "ok", detail: "Upload received", at: isoDaysAgo(0) }],
      employee_id: "E1007",
      employee_name: "Mei Ling",
      month: curM,
      year: curY,
      record_id: null,
      extraction_model: null,
      extraction_method: null,
      used_ocr: false,
      auto_accepted: false,
      can_retry: false,
      can_resolve_assign: false,
      resolved_at: null,
      resolution_note: null,
      created_at: isoDaysAgo(0),
      updated_at: isoDaysAgo(0),
      pdfKey: `ts-emp-007-${curY}-${curM}`,
      extraction_meta: null
    },
    {
      id: "pipe-007",
      filename: "Liam_Walsh_manual.pdf",
      content_type: "application/pdf",
      size_bytes: tsSize(`ts-emp-006-${prevY}-${prevM}`),
      source_kind: "manual",
      source_id: null,
      attachment_id: null,
      status: "success",
      stage: "filed",
      failure_code: null,
      failure_label: null,
      failure_detail: null,
      events: [
        { stage: "manual", status: "ok", detail: "Manual entry", at: isoDaysAgo(8) },
        { stage: "file", status: "ok", detail: "Filed rec-002", at: isoDaysAgo(8) }
      ],
      employee_id: "E1006",
      employee_name: "Liam Walsh",
      month: prevM,
      year: prevY,
      record_id: "rec-002",
      extraction_model: null,
      extraction_method: "manual",
      used_ocr: false,
      auto_accepted: false,
      can_retry: false,
      can_resolve_assign: false,
      resolved_at: null,
      resolution_note: null,
      created_at: isoDaysAgo(8),
      updated_at: isoDaysAgo(8),
      pdfKey: `ts-emp-006-${prevY}-${prevM}`,
      extraction_meta: null
    },
    {
      id: "pipe-008",
      filename: "portal_aisha_ts.pdf",
      content_type: "application/pdf",
      size_bytes: tsSize(`ts-emp-001-${prevY}-${prevM}`),
      source_kind: "portal",
      source_id: "psub-002",
      attachment_id: null,
      status: "needs_review",
      stage: "staged",
      failure_code: null,
      failure_label: null,
      failure_detail: null,
      events: [
        { stage: "portal", status: "ok", detail: "Portal submit", at: isoDaysAgo(1) },
        { stage: "extract", status: "ok", detail: "OK", at: isoDaysAgo(1) }
      ],
      employee_id: "E1001",
      employee_name: "Aisha Rahman",
      month: prevM,
      year: prevY,
      record_id: null,
      extraction_model: "demo-gpt",
      extraction_method: "vision",
      used_ocr: false,
      auto_accepted: true,
      can_retry: true,
      can_resolve_assign: true,
      resolved_at: null,
      resolution_note: null,
      created_at: isoDaysAgo(1),
      updated_at: isoDaysAgo(1),
      pdfKey: `ts-emp-001-${prevY}-${prevM}`,
      extraction_meta: {
        staged: stagedFromAttendance(prevY, prevM, employees[0], leavePrev("emp-001")),
        full_email_extract: {
          approval: { detected: true, detail: "Employee claimed manager approval on portal submit" },
          sheets: [{ filename: "portal_aisha_ts.pdf", employee_name: "Aisha Rahman", employee_id: "E1001" }]
        },
        auto_accept: { accepted: true, confidence: "high", reasons: ["Portal attestation", "Buckets match sheet"], blockers: [] }
      }
    }
  ];
  const records = [
    makeRecord({ id: "rec-001", emp: employees[1], month: prevM, year: prevY, annual: [3, 4], sick: [14], validation: "verified", approval: "approved", emailId: "msg-002" }),
    makeRecord({ id: "rec-002", emp: employees[5], month: prevM, year: prevY, annual: [8], remote: [20, 21], validation: "verified", approval: "approved" }),
    makeRecord({ id: "rec-003", emp: employees[3], month: prevM, year: prevY, sick: [11, 12], validation: "manual_review", approval: "pending" }),
    makeRecord({ id: "rec-004", emp: employees[4], month: curM, year: curY, annual: [2], validation: "verified", approval: "approved" }),
    makeRecord({ id: "rec-005", emp: employees[7], month: curM, year: curY, remote: [7, 8, 9], validation: "manual_review", approval: "pending" })
  ];
  const vaultFiles = [];
  for (const t of [
    { emp: employees[1], m: prevM, y: prevY },
    { emp: employees[5], m: prevM, y: prevY },
    { emp: employees[4], m: curM, y: curY },
    { emp: employees[7], m: curM, y: curY },
    { emp: employees[0], m: prevM, y: prevY }
  ]) {
    const monthLabel = `${MONTHS_LONG[t.m]} ${t.y}`;
    const pdfKey = `ts-${t.emp.id}-${t.y}-${t.m}`;
    vaultFiles.push({
      name: `${t.emp.name.replace(/\s+/g, "_")}_TS.pdf`,
      rel_path: `${t.emp.account_manager}/${t.emp.name}/${monthLabel}/${t.emp.name.replace(/\s+/g, "_")}_TS.pdf`,
      size: pdfs[pdfKey]?.length ?? 2e3,
      content_type: "application/pdf",
      stored_at: isoDaysAgo(4),
      pdfKey
    });
  }
  return {
    users,
    portalUsers,
    employees,
    emails,
    pipeline,
    records,
    vaultFiles,
    calendars: [
      { id: "cal-001", month: curM, year: curY, weekend_weekdays: ["Friday", "Saturday"], public_holidays: [{ date: dateInMonth(curY, curM, Math.min(15, daysInMonth2(curY, curM))), name: "Demo Holiday" }], created_at: isoDaysAgo(30), updated_at: isoDaysAgo(30) },
      { id: "cal-002", month: prevM, year: prevY, weekend_weekdays: ["Friday", "Saturday"], public_holidays: [], created_at: isoDaysAgo(60), updated_at: isoDaysAgo(60) }
    ],
    reminderConfig: { auto_send_enabled: true, email_preference: "work", send_day: 28, send_hour_uae: 9, updated_at: isoDaysAgo(10), updated_by: "admin", scheduled_check_enabled: true, sending_enabled: true },
    reminderRuns: [{
      id: "rrun-001",
      trigger: "manual_batch",
      month: curM,
      year: curY,
      started_at: isoDaysAgo(7),
      finished_at: isoDaysAgo(7),
      total: 3,
      sent_count: 2,
      failed_count: 0,
      skipped_count: 1,
      triggered_by: "admin",
      logs: [
        { id: "rlog-001", run_id: "rrun-001", employee_pk: "emp-007", employee_id: "E1007", employee_name: "Mei Ling", recipient_email: "mei.ling@demo.local", month: curM, year: curY, trigger: "manual_batch", status: "sent", error: null, sent_at: isoDaysAgo(7), created_at: isoDaysAgo(7) },
        { id: "rlog-002", run_id: "rrun-001", employee_pk: "emp-008", employee_id: "E1008", employee_name: "Carlos Mendes", recipient_email: "carlos.mendes@demo.local", month: curM, year: curY, trigger: "manual_batch", status: "sent", error: null, sent_at: isoDaysAgo(7), created_at: isoDaysAgo(7) }
      ]
    }],
    systemNotice: { message: "Welcome to the Timesheets demo \u2014 no backend required.", enabled: true, updated_at: isoDaysAgo(1), updated_by: "admin" },
    chatAccess: { enabled_for_others: true, updated_at: isoDaysAgo(5), updated_by: "admin" },
    aiStatus: [
      { kind: "extraction", label: "Extract Email / Upload", provider: "demo", model: "demo-gpt-vision", has_key: true, note: "Mock \u2014 no real LLM calls" },
      { kind: "agent", label: "Ask AI", provider: "demo", model: "demo-gpt", has_key: true, note: "Mock canned replies" }
    ],
    systemHealth: [
      { component: "llm", status: "ok", detail: "Demo mode \u2014 LLM mocked", last_checked_at: isoDaysAgo(0), last_ok_at: isoDaysAgo(0), last_alert_sent_at: null },
      { component: "graph", status: "ok", detail: "Demo mode \u2014 mailbox mocked", last_checked_at: isoDaysAgo(0), last_ok_at: isoDaysAgo(0), last_alert_sent_at: null }
    ],
    portalSubmissions: [
      {
        id: "psub-001",
        employee_pk: "emp-001",
        employee_name: "Aisha Rahman",
        employee_id: "E1001",
        month: curM,
        year: curY,
        status: "draft",
        manager_decision: "pending",
        manager_note: null,
        decided_at: null,
        approval_claimed: false,
        employee_note: "Working on draft",
        extraction_state: "not_started",
        extraction_error: null,
        review_state: null,
        record_id: null,
        submitted_at: null,
        created_at: isoDaysAgo(2),
        updated_at: isoDaysAgo(1),
        files: [{ id: "psfile-001", kind: "timesheet", filename: "draft_aisha.pdf", content_type: "application/pdf", size_bytes: 4e3, created_at: isoDaysAgo(1), pdfKey: `ts-emp-001-${curY}-${curM}` }],
        pipeline_files: []
      },
      {
        id: "psub-002",
        employee_pk: "emp-001",
        employee_name: "Aisha Rahman",
        employee_id: "E1001",
        month: prevM,
        year: prevY,
        status: "submitted",
        manager_decision: "pending",
        manager_note: null,
        decided_at: null,
        approval_claimed: true,
        employee_note: "Submitted via portal",
        extraction_state: "done",
        extraction_error: null,
        review_state: "needs_review",
        record_id: null,
        submitted_at: isoDaysAgo(1),
        created_at: isoDaysAgo(3),
        updated_at: isoDaysAgo(1),
        files: [{ id: "psfile-002", kind: "timesheet", filename: "portal_aisha_ts.pdf", content_type: "application/pdf", size_bytes: 4e3, created_at: isoDaysAgo(1), pdfKey: `ts-emp-001-${prevY}-${prevM}` }],
        pipeline_files: [{ kind: "timesheet", pipeline_file_id: "pipe-008", pipeline_status: "needs_review", record_id: null }]
      }
    ],
    debugRuns: [
      {
        id: "debug-001",
        created_at: isoDaysAgo(4),
        source_kind: "email",
        source_id: "msg-002",
        thread_key: "conv-002",
        subject: emails[2].subject,
        model: "demo-gpt",
        calls: 2,
        reused_sheets: 0,
        n_pass1_calls: 1,
        n_pass2_calls: 1,
        n_dropped: 0,
        n_sheets: 1,
        n_errors: 0,
        pass1_calls: [{ label: "pass1", model: "demo-gpt", system_prompt: "Classify thread attachments", user_text: "Thread subject + bodies", image_count: 1, response_json: { confirmed: ["Omar_Hassan_TS.pdf"], dropped: [] } }],
        pass2_calls: [{ label: "pass2", model: "demo-gpt", system_prompt: "Extract leave buckets", user_text: "Omar_Hassan_TS.pdf", image_count: 1, response_json: { employee: "Omar Hassan", month: prevM, year: prevY } }],
        dropped_items: [],
        triage: [{ name: "Omar_Hassan_TS.pdf", kind: "timesheet" }],
        sheets: [{ filename: "Omar_Hassan_TS.pdf", employee: "Omar Hassan" }],
        errors: []
      },
      {
        id: "debug-002",
        created_at: isoDaysAgo(1),
        source_kind: "email",
        source_id: "msg-001",
        thread_key: "conv-001",
        subject: emails[0].subject,
        model: "demo-gpt",
        calls: 2,
        reused_sheets: 0,
        n_pass1_calls: 1,
        n_pass2_calls: 1,
        n_dropped: 1,
        n_sheets: 1,
        n_errors: 0,
        pass1_calls: [{ label: "pass1", model: "demo-gpt", system_prompt: "Classify", user_text: "...", image_count: 2, response_json: { confirmed: ["Aisha_Rahman_TS.pdf"], dropped: ["approval.png"] } }],
        pass2_calls: [{ label: "pass2", model: "demo-gpt", system_prompt: "Extract", user_text: "Aisha_Rahman_TS.pdf", image_count: 1, response_json: { employee: "Aisha Rahman" } }],
        dropped_items: [{ name: "approval.png", reason: "Not a timesheet", filter: "pass1", size: 1800, mime: "image/png", msg_index: 0, thumb: null, image_path: null }],
        triage: [],
        sheets: [{ filename: "Aisha_Rahman_TS.pdf" }],
        errors: []
      }
    ],
    autoExtract: { state: "idle", total: 0, processed: 0, succeeded: 0, failed: 0, skipped: 0, current: null, started_at: null, finished_at: null, last_error: null, enabled: false },
    pdfs
  };
}

// mock/store.ts
var import_fs = require("fs");
var import_path = require("path");
var STORE_PATH = (0, import_path.join)(process.cwd(), ".demo-store.json");
var serverlessDemo = !!process.env.VERCEL;
var store = null;
var seq = 100;
var saveTimer = null;
function nextId(prefix) {
  seq += 1;
  scheduleSave();
  return `${prefix}-${String(seq).padStart(3, "0")}`;
}
function ensurePublicDemoPdfs(s) {
  try {
    const publicDir = (0, import_path.join)(process.cwd(), "public", "demo");
    if (!(0, import_fs.existsSync)(publicDir)) (0, import_fs.mkdirSync)(publicDir, { recursive: true });
    const samples = [
      ["aisha-timesheet.pdf", s.pdfs["ts-emp-001-" + (/* @__PURE__ */ new Date()).getFullYear() + "-" + ((/* @__PURE__ */ new Date()).getMonth() + 1)] ?? makeTimesheetPdf("Aisha Rahman", (/* @__PURE__ */ new Date()).getMonth() + 1, (/* @__PURE__ */ new Date()).getFullYear())],
      ["omar-timesheet.pdf", makeTimesheetPdf("Omar Hassan", (/* @__PURE__ */ new Date()).getMonth() + 1, (/* @__PURE__ */ new Date()).getFullYear())],
      ["demo-sheet.pdf", s.pdfs["generic"] ?? makeTimesheetPdf("Demo Employee", 1, 2026)]
    ];
    for (const [name, buf] of samples) {
      (0, import_fs.writeFileSync)((0, import_path.join)(publicDir, name), buf);
    }
  } catch {
  }
}
function attachPdfs(data) {
  const fresh = buildSeed();
  return { ...data, pdfs: fresh.pdfs };
}
function stripPdfs(s) {
  const { pdfs: _p, ...rest } = s;
  return rest;
}
function saveStore() {
  if (!store || serverlessDemo) return;
  try {
    const payload = { seq, data: stripPdfs(store) };
    (0, import_fs.writeFileSync)(STORE_PATH, JSON.stringify(payload), "utf8");
  } catch (err) {
    console.warn("[demo-store] save failed", err);
  }
}
function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    saveStore();
  }, 200);
}
function loadFromDisk() {
  if (serverlessDemo) return null;
  try {
    if (!(0, import_fs.existsSync)(STORE_PATH)) return null;
    const raw = JSON.parse((0, import_fs.readFileSync)(STORE_PATH, "utf8"));
    if (!raw?.data?.users) return null;
    seq = typeof raw.seq === "number" ? raw.seq : 100;
    return attachPdfs(raw.data);
  } catch {
    return null;
  }
}
function getStore() {
  if (!store) {
    store = loadFromDisk() ?? buildSeed();
    ensurePublicDemoPdfs(store);
  }
  return store;
}
function resetStore() {
  if (!serverlessDemo) {
    try {
      if ((0, import_fs.existsSync)(STORE_PATH)) (0, import_fs.unlinkSync)(STORE_PATH);
    } catch {
    }
  }
  store = buildSeed();
  seq = 100;
  ensurePublicDemoPdfs(store);
  saveStore();
  return store;
}
function getPdf(key) {
  const s = getStore();
  if (key && s.pdfs[key]) return s.pdfs[key];
  return s.pdfs["generic"] ?? makeTimesheetPdf("Demo", 1, 2026);
}
function publicUser(u) {
  const { password: _p, ...rest } = u;
  return rest;
}
function publicPortalUser(u) {
  const { password: _p, ...rest } = u;
  return rest;
}

// mock/sse.ts
function writeSse(res, data) {
  res.write(`data: ${JSON.stringify(data)}

`);
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
async function streamExtractionDemo(res, result) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive"
  });
  const t0 = Date.now();
  let llm = 0;
  const emit = (stage, status, message, data = {}) => {
    writeSse(res, {
      stage,
      status,
      message,
      llm_calls: llm,
      elapsed_ms: Date.now() - t0,
      data
    });
  };
  emit("start", "start", "Starting extraction\u2026");
  await sleep(80);
  emit("unpack", "spin", "Unpacking attachments\u2026");
  await sleep(120);
  emit("unpack", "ok", "Attachments ready", { dropped: [] });
  await sleep(80);
  emit("pass1", "spin", "Classifying thread (pass 1)\u2026");
  llm += 1;
  await sleep(150);
  emit("pass1", "ok", "Timesheet confirmed", { confirmed: ["timesheet.pdf"] });
  await sleep(80);
  emit("pass2", "spin", "Extracting leave buckets (pass 2)\u2026");
  llm += 1;
  await sleep(180);
  emit("pass2", "ok", "Buckets extracted", { raw: { annual_leave: [] } });
  await sleep(60);
  emit("group", "ok", "Grouped by employee + month");
  await sleep(60);
  emit("autoaccept", "ok", "Auto-accept checks complete");
  await sleep(60);
  emit("done", "ok", "Extraction complete", { result });
  res.end();
}
async function streamChatDemo(res, userText) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive"
  });
  const reply = 'This is a **demo** Ask AI reply (no real model). You asked: "' + (userText || "\u2026").slice(0, 200) + '". In the full app this would answer timesheet questions without DB access.';
  const words = reply.split(/(\s+)/);
  for (const w of words) {
    writeSse(res, { type: "token", text: w });
    await sleep(18);
  }
  writeSse(res, { type: "done", error: null });
  res.end();
}

// mock/http.ts
function parseUrl(req) {
  const raw = req.url || "/";
  const q = raw.indexOf("?");
  const pathname = q >= 0 ? raw.slice(0, q) : raw;
  const search = q >= 0 ? raw.slice(q + 1) : "";
  return { pathname, query: new URLSearchParams(search) };
}
function json(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(data)
  });
  res.end(data);
}
function sendPdf(res, buf, filename) {
  sendBinary(res, buf, "application/pdf", filename);
}
function sendBinary(res, buf, contentType, filename) {
  const headers = {
    "Content-Type": contentType,
    "Content-Length": buf.length,
    "Cache-Control": "no-store"
  };
  if (filename) headers["Content-Disposition"] = `inline; filename="${filename}"`;
  res.writeHead(200, headers);
  res.end(buf);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}
async function readJson(req) {
  const buf = await readBody(req);
  if (!buf.length) return {};
  try {
    return JSON.parse(buf.toString("utf8"));
  } catch {
    return {};
  }
}
function parseMultipartFilenames(buf, contentType) {
  const names = [];
  if (!contentType || !contentType.includes("multipart")) return names;
  const m = /boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(contentType);
  const boundary = m?.[1] || m?.[2];
  if (!boundary) return names;
  const text2 = buf.toString("latin1");
  const re = /Content-Disposition:[^\n]*filename="([^"]+)"/gi;
  let match;
  while (match = re.exec(text2)) names.push(match[1]);
  if (!names.length) names.push("file.pdf");
  return names;
}
function getAuthToken(req, query) {
  const h = req.headers.authorization || "";
  if (h.toLowerCase().startsWith("bearer ")) return h.slice(7).trim();
  return query.get("token");
}
function tokenOk(token) {
  if (!token) return false;
  return token.startsWith("demo-") || token.startsWith("login-");
}
function userFromToken(token) {
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
function portalUserFromToken(token) {
  const s = getStore();
  if (!token || !token.startsWith("demo-portal-")) return null;
  const uname = token.replace("demo-portal-", "");
  return s.portalUsers.find((u) => u.username === uname) || null;
}
function requireAuth(req, res, query) {
  const token = getAuthToken(req, query);
  if (!tokenOk(token)) {
    json(res, 401, { detail: "Not authenticated" });
    return null;
  }
  return token;
}
function requireWrite(req, res, query) {
  const token = requireAuth(req, res, query);
  if (!token) return null;
  const u = userFromToken(token);
  if (!u || "role" in u && u.role === "viewer") {
    json(res, 403, { detail: "Read-only role cannot make changes" });
    return null;
  }
  return token;
}
function pageItems(items, offset, limit) {
  const slice = items.slice(offset, offset + limit);
  return {
    items: slice,
    total: items.length,
    limit,
    offset,
    has_more: offset + limit < items.length
  };
}
function stripPipe(p2) {
  const { pdfKey: _k, thread_key: _t, ...rest } = p2;
  return rest;
}
function recount(rec) {
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
function emlPreview(subject, from_) {
  return {
    subject,
    from_,
    to: "timesheets@demo.local",
    date: (/* @__PURE__ */ new Date()).toUTCString(),
    body_text: "Demo email body",
    body_html: "<p>Demo email body</p>",
    attachments: [],
    warnings: []
  };
}

// mock/router.ts
function coverageSummary(year, month, q, location, status, onlyMissing, offset, limit) {
  const s = getStore();
  const rows = s.employees.filter((e) => e.active).map((emp) => {
    const recs = s.records.filter((r) => r.matched_employee_pk === emp.id);
    const focus = recs.find((r) => r.month === month && r.year === year) || null;
    const pipePending = s.pipeline.filter((p2) => p2.employee_id === emp.employee_id && p2.month === month && p2.year === year && p2.status === "needs_review");
    const submitted = !!focus || pipePending.length > 0;
    const awaiting = pipePending.length > 0 && !focus;
    return {
      employee_pk: emp.id,
      employee_id: emp.employee_id,
      employee_name: emp.name,
      account_manager: emp.account_manager,
      dco_number: emp.dco_number,
      location: emp.location,
      status: submitted ? "green" : "yellow",
      record_count: recs.length,
      needs_review_count: pipePending.length,
      pending_approval_count: recs.filter((r) => r.approval_status === "pending").length,
      years: [...new Set(recs.map((r) => r.year))],
      submitted_months: recs.filter((r) => r.year === year).map((r) => r.month),
      in_matcher: true,
      has_records: recs.length > 0,
      focus_record_id: focus?.id ?? null,
      focus_validation_status: focus?.validation_status ?? null,
      focus_approval_status: focus?.approval_status ?? null,
      awaiting_review_this_month: awaiting,
      _missing: !submitted,
      _awaiting: awaiting
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
    year,
    month,
    total_employees: rows.length,
    submitted_this_month,
    missing_this_month,
    awaiting_review_this_month,
    submitted_pct: rows.length ? Math.round(submitted_this_month / rows.length * 100) : 0,
    missing_pct: rows.length ? Math.round(missing_this_month / rows.length * 100) : 0,
    awaiting_review_pct: rows.length ? Math.round(awaiting_review_this_month / rows.length * 100) : 0,
    needs_review: s.pipeline.filter((p2) => p2.status === "needs_review").length,
    pending_approval: s.records.filter((r) => r.approval_status === "pending").length,
    missing_employees: rows.filter((r) => r._missing).map((r) => r.employee_name || ""),
    rows: slice,
    filtered_total: total,
    limit,
    offset,
    has_more: offset + limit < total
  };
}
function pipelineStats(successWindowDays = 30) {
  const s = getStore();
  const cutoff = Date.now() - successWindowDays * 864e5;
  const by_failure_code = {};
  const failure_labels = {};
  for (const p2 of s.pipeline) {
    if (p2.failure_code) {
      by_failure_code[p2.failure_code] = (by_failure_code[p2.failure_code] || 0) + 1;
      if (p2.failure_label) failure_labels[p2.failure_code] = p2.failure_label;
    }
  }
  return {
    total: s.pipeline.length,
    processing: s.pipeline.filter((p2) => p2.status === "processing").length,
    success: s.pipeline.filter((p2) => p2.status === "success").length,
    success_recent: s.pipeline.filter((p2) => p2.status === "success" && p2.updated_at && Date.parse(p2.updated_at) >= cutoff).length,
    needs_review: s.pipeline.filter((p2) => p2.status === "needs_review").length,
    failed: s.pipeline.filter((p2) => p2.status === "failed").length,
    resolved: s.pipeline.filter((p2) => p2.status === "resolved").length,
    by_failure_code,
    failure_labels
  };
}
function listThreads(q, status) {
  const s = getStore();
  const byConv = /* @__PURE__ */ new Map();
  for (const e of s.emails) {
    const key = e.conversation_id || e.id;
    if (!byConv.has(key)) byConv.set(key, []);
    byConv.get(key).push(e);
  }
  const threads = [...byConv.values()].map((msgs) => {
    const sorted = [...msgs].sort((a, b) => Date.parse(b.received_at || "") - Date.parse(a.received_at || ""));
    const newest = sorted[0];
    const withFiles = sorted.find((m) => m.attachments.length > 0) || newest;
    const anyExtracted = sorted.find((m) => m.extract_email_at) || newest;
    const { body_text, body_html, to_recipients, cc_recipients, inline_attachment_ids, summary, extracted_sheets, extracted_at, extracted_filenames, ...list } = newest;
    return {
      ...list,
      attachment_count: msgs.reduce((n, m) => n + (m.attachments?.length || 0), 0),
      has_approval_screenshot: msgs.some((m) => m.has_approval_screenshot),
      extract_email_at: anyExtracted.extract_email_at,
      no_sheets_found_at: sorted.find((m) => m.no_sheets_found_at)?.no_sheets_found_at ?? null,
      attachments: withFiles.attachments.map(({ pdfKey, ...a }) => a),
      thread_id: newest.thread_id || newest.conversation_id || newest.id,
      thread_message_count: msgs.length
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
function findEmail(msgId) {
  const s = getStore();
  return s.emails.find((e) => e.provider_message_id === msgId || e.id === msgId) || null;
}
function stagePipelineFromEmail(msgId) {
  const s = getStore();
  const email = findEmail(msgId);
  if (!email) return [];
  const { month, year } = currentPeriod();
  const staged = [];
  const sheets = email.attachments.filter((a) => a.kind === "timesheet");
  for (const att of sheets.length ? sheets : email.attachments.slice(0, 1)) {
    const emp = s.employees.find((e) => e.work_email === email.sender_email || e.employee_email_id === email.sender_email);
    const id = nextId("pipe");
    const item = {
      id,
      filename: att.filename,
      content_type: att.content_type,
      size_bytes: att.size ?? 2e3,
      source_kind: "email",
      source_id: email.provider_message_id,
      attachment_id: att.attachment_id,
      status: "needs_review",
      stage: "staged",
      failure_code: emp ? null : "no_employee_match",
      failure_label: emp ? null : "Employee not matched",
      failure_detail: emp ? null : "Demo unmatched",
      events: [
        { stage: "ingest", status: "ok", detail: "OK", at: (/* @__PURE__ */ new Date()).toISOString() },
        { stage: "extract", status: "ok", detail: "OK", at: (/* @__PURE__ */ new Date()).toISOString() },
        { stage: "match", status: emp ? "ok" : "warn", detail: emp ? "Matched" : "Unmatched", at: (/* @__PURE__ */ new Date()).toISOString() }
      ],
      employee_id: emp?.employee_id ?? null,
      employee_name: emp?.name ?? null,
      month,
      year,
      record_id: null,
      extraction_model: "demo-gpt",
      extraction_method: "vision",
      used_ocr: false,
      auto_accepted: !!emp,
      can_retry: true,
      can_resolve_assign: true,
      resolved_at: null,
      resolution_note: null,
      created_at: (/* @__PURE__ */ new Date()).toISOString(),
      updated_at: (/* @__PURE__ */ new Date()).toISOString(),
      pdfKey: att.pdfKey || "generic",
      thread_key: email.conversation_id,
      extraction_meta: {
        staged: stagedFromAttendance(
          year,
          month,
          emp ? { id: emp.id, name: emp.name, employee_id: emp.employee_id } : null,
          { annualLeave: [3, 4], remoteWork: [8, 9], sickLeave: [] }
        )
      }
    };
    s.pipeline.unshift(item);
    staged.push(item);
  }
  email.extract_email_at = (/* @__PURE__ */ new Date()).toISOString();
  email.extracted_at = email.extract_email_at;
  email.extracted_sheets = sheets.map((a) => a.filename);
  email.extracted_filenames = email.extracted_sheets;
  return staged;
}
function vaultManagers() {
  const s = getStore();
  const map = /* @__PURE__ */ new Map();
  for (const f of s.vaultFiles) {
    const [mgr, emp] = f.rel_path.split("/");
    if (!map.has(mgr)) map.set(mgr, /* @__PURE__ */ new Set());
    map.get(mgr).add(emp);
  }
  for (const e of s.employees) {
    if (!e.account_manager) continue;
    if (!map.has(e.account_manager)) map.set(e.account_manager, /* @__PURE__ */ new Set());
    map.get(e.account_manager).add(e.name);
  }
  return [...map.entries()].map(([name, emps]) => ({ name, rel_path: name, employee_count: emps.size }));
}
function decodePath(s) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}
function mockMiddleware(req, res, next) {
  const r = req;
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
  void handleApi(r, res, method, pathname, query).then(() => {
    if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
      scheduleSave();
    }
  }).catch((err) => {
    console.error("[mock-api]", err);
    if (!res.headersSent) json(res, 500, { detail: String(err) });
  });
}
async function handleApi(req, res, method, pathname, query) {
  const path = pathname.replace(/^\/api\/v1/, "") || "/";
  const s = getStore();
  const parts = path.split("/").filter(Boolean);
  if (parts[0] === "demo" && parts[1] === "reset" && method === "POST") {
    resetStore();
    return json(res, 200, { ok: true, message: "Demo data reset to seed defaults" });
  }
  const mutating = method !== "GET" && method !== "HEAD" && method !== "OPTIONS";
  const skipWriteGate = parts[0] === "auth" || parts[0] === "portal" && parts[1] === "auth" || parts[0] === "portal";
  if (mutating && !skipWriteGate) {
    if (!requireWrite(req, res, query)) return;
  }
  if (parts[0] === "auth") {
    if (parts[1] === "login" && method === "POST") {
      const body = await readJson(req);
      const demoUsers = [
        { username: "admin", password: "admin", role: "admin", email: "admin@demo.local" },
        { username: "user", password: "user", role: "user", email: "user@demo.local" },
        { username: "viewer", password: "viewer", role: "viewer", email: "viewer@demo.local" },
        { username: "vault", password: "vault", role: "vault_matcher", email: "vault@demo.local" }
      ];
      for (const d of demoUsers) {
        if (!s.users.some((x) => x.username === d.username)) {
          s.users.push({
            id: `user-${d.username}`,
            username: d.username,
            password: d.password,
            email: d.email,
            role: d.role,
            auth_mode: "captcha",
            is_active: true,
            last_login_at: null,
            last_seen_at: null,
            online: false
          });
        }
      }
      const aliases = {
        admin: ["admin", "admin123"],
        user: ["user", "user123"],
        viewer: ["viewer", "viewer123"],
        vault: ["vault", "vault123"]
      };
      const u = s.users.find((x) => {
        if (x.username !== body.username) return false;
        const ok = aliases[x.username] || [x.password];
        return ok.includes(body.password) || x.password === body.password;
      });
      if (!u) return json(res, 401, { detail: "Invalid credentials" });
      u.last_login_at = (/* @__PURE__ */ new Date()).toISOString();
      const token = `demo-${u.username}`;
      return json(res, 200, { status: "authenticated", access_token: token, user: publicUser(u) });
    }
    if (parts[1] === "me" && method === "GET") {
      const token = requireAuth(req, res, query);
      if (!token) return;
      const u = userFromToken(token);
      if (!u || !("role" in u) || u.role === "employee") return json(res, 401, { detail: "Not authenticated" });
      return json(res, 200, publicUser(u));
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
  if (parts[0] === "portal" && parts[1] === "auth") {
    if (parts[2] === "login" && method === "POST") {
      const body = await readJson(req);
      const u = s.portalUsers.find((x) => x.username === body.username && x.password === body.password);
      if (!u) return json(res, 401, { detail: "Invalid credentials" });
      u.last_login_at = (/* @__PURE__ */ new Date()).toISOString();
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
          id: nextId("psub"),
          employee_pk: pu.employee_pk,
          employee_name: pu.employee_name,
          employee_id: pu.employee_id,
          month: body.month,
          year: body.year,
          status: "draft",
          manager_decision: "pending",
          manager_note: null,
          decided_at: null,
          approval_claimed: false,
          employee_note: body.employee_note || null,
          extraction_state: "not_started",
          extraction_error: null,
          review_state: null,
          record_id: null,
          submitted_at: null,
          created_at: (/* @__PURE__ */ new Date()).toISOString(),
          updated_at: (/* @__PURE__ */ new Date()).toISOString(),
          files: [],
          pipeline_files: []
        };
        s.portalSubmissions.push(sub);
      } else if (body.employee_note !== void 0) {
        sub.employee_note = body.employee_note;
        sub.updated_at = (/* @__PURE__ */ new Date()).toISOString();
      }
      return json(res, 200, sub);
    }
    if (parts.length === 5 && method === "GET") {
      const month = Number(parts[3]);
      const year = Number(parts[4]);
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
      if (body.approval_claimed === void 0) return json(res, 422, { detail: "approval_claimed required" });
      sub.approval_claimed = !!body.approval_claimed;
      sub.status = "submitted";
      sub.submitted_at = (/* @__PURE__ */ new Date()).toISOString();
      sub.extraction_state = "done";
      sub.updated_at = sub.submitted_at;
      const pipeId = nextId("pipe");
      s.pipeline.unshift({
        id: pipeId,
        filename: sub.files[0]?.filename || "portal.pdf",
        content_type: "application/pdf",
        size_bytes: 4e3,
        source_kind: "portal",
        source_id: sub.id,
        attachment_id: null,
        status: "needs_review",
        stage: "staged",
        failure_code: null,
        failure_label: null,
        failure_detail: null,
        events: [{ stage: "portal", status: "ok", detail: "Submitted", at: sub.submitted_at }],
        employee_id: sub.employee_id,
        employee_name: sub.employee_name,
        month: sub.month,
        year: sub.year,
        record_id: null,
        extraction_model: "demo-gpt",
        extraction_method: "vision",
        used_ocr: false,
        extraction_meta: { staged: { employee_pk: sub.employee_pk, matched_name: sub.employee_name, matched_employee_id: sub.employee_id, month: sub.month, year: sub.year, buckets: {} } },
        auto_accepted: true,
        can_retry: true,
        can_resolve_assign: true,
        resolved_at: null,
        resolution_note: null,
        created_at: sub.submitted_at,
        updated_at: sub.submitted_at,
        pdfKey: sub.files[0]?.pdfKey || "generic"
      });
      sub.pipeline_files = [{ kind: "timesheet", pipeline_file_id: pipeId, pipeline_status: "needs_review", record_id: null }];
      return json(res, 200, sub);
    }
    if (parts.length >= 5 && parts[4] === "files") {
      const sub = s.portalSubmissions.find((x) => x.id === parts[3]);
      if (!sub) return json(res, 404, { detail: "Not found" });
      if (parts.length === 5 && method === "POST") {
        const kind = query.get("kind") || "timesheet";
        await readBody(req);
        const f = { id: nextId("psfile"), kind, filename: "upload.pdf", content_type: "application/pdf", size_bytes: 3e3, created_at: (/* @__PURE__ */ new Date()).toISOString(), pdfKey: "generic" };
        sub.files = sub.files.filter((x) => x.kind !== kind);
        sub.files.push(f);
        sub.updated_at = (/* @__PURE__ */ new Date()).toISOString();
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
  const openAuth = path.startsWith("/auth/") || path.startsWith("/portal/auth/");
  if (!openAuth && parts[0] !== "portal") {
  }
  const isPortalRoute = parts[0] === "portal";
  if (!isPortalRoute && !(parts[0] === "auth")) {
    const token = requireAuth(req, res, query);
    if (!token) return;
    if (token.startsWith("demo-portal-")) return json(res, 401, { detail: "Portal token not valid here" });
  }
  if (parts[0] === "notice") {
    if (method === "GET") return json(res, 200, s.systemNotice);
    if (method === "PUT") {
      const body = await readJson(req);
      Object.assign(s.systemNotice, body, { updated_at: (/* @__PURE__ */ new Date()).toISOString(), updated_by: "admin" });
      return json(res, 200, s.systemNotice);
    }
  }
  if (parts[0] === "system-health") {
    if (parts[1] === "check-now" && method === "POST") return json(res, 200, { ok: true, rows: s.systemHealth });
    if (method === "GET") return json(res, 200, s.systemHealth);
  }
  if (parts[0] === "agentic-chat") {
    if (parts[1] === "suggestions" && method === "GET") return json(res, 200, { enabled: true, model: "demo-gpt" });
    if (parts[1] === "access" && method === "GET") return json(res, 200, s.chatAccess);
    if (parts[1] === "access" && method === "PUT") {
      const body = await readJson(req);
      s.chatAccess.enabled_for_others = !!body.enabled_for_others;
      s.chatAccess.updated_at = (/* @__PURE__ */ new Date()).toISOString();
      s.chatAccess.updated_by = "admin";
      return json(res, 200, s.chatAccess);
    }
    if (parts[1] === "stream" && method === "POST") {
      const buf = await readBody(req);
      let userText = "hello";
      try {
        const ct = String(req.headers["content-type"] || "");
        if (ct.includes("multipart")) {
          const text2 = buf.toString("utf8");
          const m = /name="messages"[\r\n]+([\s\S]*?)(?:\r?\n--)/.exec(text2);
          if (m) {
            const msgs = JSON.parse(m[1].trim());
            userText = msgs.filter((x) => x.role === "user").pop()?.content || userText;
          }
        } else {
          const body = JSON.parse(buf.toString("utf8") || "{}");
          userText = body.messages?.filter((x) => x.role === "user").pop()?.content || userText;
        }
      } catch {
      }
      await streamChatDemo(res, userText);
      return;
    }
  }
  if (parts[0] === "inbox") {
    if (parts[1] === "threads" && method === "GET") {
      const items = listThreads(query.get("q") || "", query.get("status") || "");
      return json(res, 200, pageItems(items, Number(query.get("offset") || 0), Number(query.get("limit") || 200)));
    }
    if (parts[1] === "auto-extract") {
      if (parts[2] === "status" && method === "GET") return json(res, 200, s.autoExtract);
      if (parts[2] === "coverage" && method === "GET") {
        const threads = listThreads("", "");
        const extracted = threads.filter((t) => s.emails.some((e) => (e.conversation_id || e.id) === (t.conversation_id || t.id) && e.extracted_at)).length;
        return json(res, 200, { extracted_threads: extracted, total_threads: threads.length });
      }
      if (parts[2] === "start" && method === "POST") {
        s.autoExtract = { ...s.autoExtract, state: "completed", enabled: true, total: 3, processed: 3, succeeded: 2, failed: 0, skipped: 1, started_at: (/* @__PURE__ */ new Date()).toISOString(), finished_at: (/* @__PURE__ */ new Date()).toISOString() };
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
        const messages = s.emails.filter((e) => (e.conversation_id || e.provider_message_id) === key).sort((a, b) => Date.parse(a.received_at || "") - Date.parse(b.received_at || "")).map((e) => ({ ...e, attachments: e.attachments.map(({ pdfKey, ...a }) => a) }));
        const root = messages[0];
        const summaryOwner = [...messages].reverse().find((m) => m.summary) || email;
        return json(res, 200, {
          thread_id: root.thread_id || root.conversation_id || root.id,
          messages,
          summary: summaryOwner.summary || null,
          extracted_sheets: email.extracted_sheets || [],
          extracted_at: email.extracted_at || null
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
          flow: "extract-full",
          model: "demo-gpt",
          pii_redaction: true,
          scope: "thread",
          steps: [{ n: 1, title: "Pass 1 classify", detail: "Demo", items: ["timesheet.pdf"] }],
          thread_messages: [email?.subject || ""],
          warnings: [],
          subject_sent: email?.subject || "",
          body_sent: email?.body_text || "",
          files_sent: [],
          images_sent: [],
          not_sent: [],
          formats_detected: ["pdf"],
          system_prompt: "demo",
          user_prompt: "demo",
          call_count: { inference: 2, file_uploads: 0, file_deletes: 0 },
          redacted: [],
          not_redacted: [],
          policy: "demo"
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
            if (hit) {
              att = hit;
              attEmail = m;
              break;
            }
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
          s.vaultFiles.push({ name: "thread.eml", rel_path: rel, size: 1200, content_type: "message/rfc822", stored_at: (/* @__PURE__ */ new Date()).toISOString(), pdfKey: "generic" });
          return json(res, 200, { saved: true, path: rel, filename: "thread.eml", employee_folder: body.employee });
        }
        if (method === "GET") {
          res.writeHead(200, { "Content-Type": "message/rfc822" });
          return res.end("From: demo@local\nSubject: " + (email?.subject || "demo") + "\n\nDemo EML");
        }
      }
    }
  }
  return handleApiRest(req, res, method, path, parts, query, s);
}
async function handleApiRest(req, res, method, path, parts, query, s) {
  const decode = decodePath;
  if (parts[0] === "pipeline") {
    if (parts[1] === "stats" && method === "GET") {
      return json(res, 200, pipelineStats(Number(query.get("success_window_days") || 30)));
    }
    if (parts[1] === "rematch-unmatched" && method === "POST") {
      const unmatched = s.pipeline.filter((p2) => p2.status === "needs_review" && !p2.employee_id);
      const rematched = [];
      const still = [];
      for (const p2 of unmatched) {
        still.push({ id: p2.id, filename: p2.filename, name: p2.employee_name, month: p2.month, year: p2.year });
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
        row.decided_at = (/* @__PURE__ */ new Date()).toISOString();
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
      const month = Number(query.get("month"));
      const year = Number(query.get("year"));
      const rows = s.employees.map((e) => {
        const has = s.portalUsers.some((p2) => p2.employee_pk === e.id);
        const submission = s.portalSubmissions.find((x) => x.employee_pk === e.id && x.month === month && x.year === year) || null;
        return { employee_pk: e.id, employee_id: e.employee_id, employee_name: e.name, has_portal_account: has, submission };
      });
      return json(res, 200, rows);
    }
    if ((!parts[1] || parts.length === 1) && method === "GET") {
      let items = [...s.pipeline];
      const status = query.get("status");
      const exclude = query.get("exclude_status");
      if (status) items = items.filter((p2) => p2.status === status);
      if (exclude) items = items.filter((p2) => p2.status !== exclude);
      if (query.get("failure_code")) items = items.filter((p2) => p2.failure_code === query.get("failure_code"));
      if (query.get("source_kind")) items = items.filter((p2) => p2.source_kind === query.get("source_kind"));
      if (query.get("source_id")) items = items.filter((p2) => p2.source_id === query.get("source_id"));
      if (query.get("thread_key")) items = items.filter((p2) => p2.thread_key === query.get("thread_key"));
      if (query.get("auto_accepted") != null) {
        const aa = query.get("auto_accepted") === "true";
        items = items.filter((p2) => p2.auto_accepted === aa);
      }
      if (query.get("month")) items = items.filter((p2) => p2.month === Number(query.get("month")));
      if (query.get("year")) items = items.filter((p2) => p2.year === Number(query.get("year")));
      if (query.get("updated_after")) {
        const t = Date.parse(query.get("updated_after"));
        items = items.filter((p2) => p2.updated_at && Date.parse(p2.updated_at) >= t);
      }
      if (query.get("q")) {
        const qq = query.get("q").toLowerCase();
        items = items.filter((p2) => (p2.filename || "").toLowerCase().includes(qq) || (p2.employee_name || "").toLowerCase().includes(qq));
      }
      items.sort((a, b) => Date.parse(b.updated_at || "") - Date.parse(a.updated_at || ""));
      const page = pageItems(items.map(stripPipe), Number(query.get("offset") || 0), Number(query.get("limit") || 200));
      return json(res, 200, page);
    }
    if (parts[1] && parts[2] === "retry" && method === "POST") {
      const p2 = s.pipeline.find((x) => x.id === parts[1]);
      if (!p2) return json(res, 404, { detail: "Not found" });
      p2.status = "needs_review";
      p2.stage = "staged";
      p2.failure_code = null;
      p2.failure_label = null;
      p2.failure_detail = null;
      p2.updated_at = (/* @__PURE__ */ new Date()).toISOString();
      p2.events.push({ stage: "retry", status: "ok", detail: "Retried (demo)", at: p2.updated_at });
      return json(res, 200, stripPipe(p2));
    }
    if (parts[1] && parts[2] === "manual-fix" && method === "POST") {
      const buf = await readBody(req);
      const p2 = s.pipeline.find((x) => x.id === parts[1]);
      if (!p2) return json(res, 404, { detail: "Not found" });
      const text2 = buf.toString("utf8");
      const get = (name) => {
        const m = new RegExp('name="' + name + '"[\\r\\n]+([\\s\\S]*?)(?:\\r?\\n--)').exec(text2);
        return m ? m[1].trim() : "";
      };
      const empPk = get("employee_pk");
      const emp = s.employees.find((e) => e.id === empPk);
      const month = Number(get("month") || p2.month);
      const year = Number(get("year") || p2.year);
      let buckets = {};
      try {
        buckets = JSON.parse(get("buckets") || "{}");
      } catch {
        buckets = {};
      }
      const recId = nextId("rec");
      const rec = {
        id: recId,
        matched_employee_pk: emp?.id ?? null,
        employee_id: emp?.employee_id ?? null,
        employee_name: emp?.name ?? null,
        account_manager: emp?.account_manager ?? null,
        dco_number: emp?.dco_number ?? null,
        match_note: "Manual fix",
        month,
        year,
        calendar_days: 30,
        annual_leave_dates: buckets.annual_leave || [],
        remote_work_dates: buckets.remote_work || [],
        sick_leave_dates: buckets.sick_leave || [],
        maternity_leave_dates: buckets.maternity_leave || [],
        unpaid_leave_dates: buckets.unpaid_leave || [],
        absent_dates: buckets.absent || [],
        public_holiday_dates: buckets.public_holiday || [],
        other_leave_dates: buckets.other_leave || [],
        working_dates: buckets.working || [],
        weekend_dates: buckets.weekend || [],
        annual_leave_count: 0,
        remote_work_count: 0,
        sick_leave_count: 0,
        maternity_leave_count: 0,
        unpaid_leave_count: 0,
        absent_count: 0,
        public_holiday_count: 0,
        other_leave_count: 0,
        working_dates_count: 0,
        weekend_dates_count: 0,
        validation_status: "manual_review",
        llm_summary: "Manual entry",
        hr_flags: [],
        approval_detected: false,
        approval_detail: get("approval_detail") || null,
        approval_status: get("approval_status") || "pending",
        source_email_id: p2.source_id,
        storage_folder: emp ? emp.account_manager + "/" + emp.name : null,
        source_files: [],
        source_file_count: 0
      };
      recount(rec);
      s.records.push(rec);
      p2.status = "success";
      p2.stage = "filed";
      p2.record_id = recId;
      p2.updated_at = (/* @__PURE__ */ new Date()).toISOString();
      p2.employee_id = emp?.employee_id ?? p2.employee_id;
      p2.employee_name = emp?.name ?? p2.employee_name;
      p2.month = month;
      p2.year = year;
      return json(res, 200, stripPipe(p2));
    }
    if (parts[1] && (parts[2] === "raw-preview" || parts[2] === "raw-render") && method === "GET") {
      const p2 = s.pipeline.find((x) => x.id === parts[1]);
      return sendPdf(res, getPdf(p2?.pdfKey), p2?.filename || "raw.pdf");
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
  if (parts[0] === "employees") {
    if (parts[1] === "coverage" && method === "GET") {
      const { month, year } = currentPeriod();
      return json(res, 200, coverageSummary(
        Number(query.get("year") || year),
        Number(query.get("month") || month),
        query.get("q") || "",
        query.get("location") || "",
        query.get("status") || "",
        query.get("only_missing") === "true",
        Number(query.get("offset") || 0),
        Number(query.get("limit") || 200)
      ));
    }
    if (parts[2] === "records" && method === "GET") {
      const pk = decode(parts[1]);
      let recs = s.records.filter((r) => r.matched_employee_pk === pk);
      if (query.get("year")) recs = recs.filter((r) => r.year === Number(query.get("year")));
      return json(res, 200, recs);
    }
  }
  if (parts[0] === "timesheets") {
    if (parts[1] === "by-period" && method === "GET") {
      const month = Number(query.get("month"));
      const year = Number(query.get("year"));
      const rows = s.employees.map((emp) => {
        const rec = s.records.find((r) => r.matched_employee_pk === emp.id && r.month === month && r.year === year);
        const pipe = s.pipeline.find((p2) => p2.employee_id === emp.employee_id && p2.month === month && p2.year === year);
        const has = !!rec;
        const status = has ? "Received & Stored" : pipe ? "Received & Not Stored" : "Not Received";
        const base = rec || {
          id: "",
          matched_employee_pk: emp.id,
          employee_id: emp.employee_id,
          employee_name: emp.name,
          account_manager: emp.account_manager,
          dco_number: emp.dco_number,
          match_note: null,
          month,
          year,
          calendar_days: null,
          annual_leave_dates: [],
          remote_work_dates: [],
          sick_leave_dates: [],
          maternity_leave_dates: [],
          unpaid_leave_dates: [],
          absent_dates: [],
          public_holiday_dates: [],
          other_leave_dates: [],
          working_dates: [],
          weekend_dates: [],
          annual_leave_count: 0,
          remote_work_count: 0,
          sick_leave_count: 0,
          maternity_leave_count: 0,
          unpaid_leave_count: 0,
          absent_count: 0,
          public_holiday_count: 0,
          other_leave_count: 0,
          working_dates_count: 0,
          weekend_dates_count: 0,
          validation_status: "",
          llm_summary: null,
          hr_flags: [],
          approval_detected: false,
          approval_detail: null,
          approval_status: "",
          source_email_id: null,
          storage_folder: null,
          source_files: [],
          source_file_count: 0
        };
        return {
          ...base,
          validation_status: rec?.validation_status ?? "",
          approval_status: rec?.approval_status ?? "",
          location: emp.location,
          project: emp.project,
          personal_email: emp.personal_email,
          work_email: emp.work_email,
          contact_no: emp.contact_no,
          has_record: has,
          status,
          received_at: pipe?.created_at ? pipe.created_at.slice(0, 16).replace("T", " ") : null,
          stored_at: rec ? (pipe?.updated_at || rec.source_files[0]?.ingested_at || "").toString().slice(0, 16).replace("T", " ") || null : null
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
        name: f.filename || "file.pdf",
        rel_path: f.key || "",
        content_type: "application/pdf",
        size: 4e3
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
  if (parts[0] === "files") {
    if (parts[1] === "managers" && method === "GET" && parts.length === 2) return json(res, 200, vaultManagers());
    if (parts[1] === "managers" && method === "POST" && parts.length === 2) {
      const body = await readJson(req);
      return json(res, 200, { name: body.name, rel_path: body.name, employee_count: 0 });
    }
    if (parts[1] === "managers" && parts[3] === "employees" && method === "GET" && parts.length === 4) {
      const mgr = decode(parts[2]);
      const emps = /* @__PURE__ */ new Map();
      for (const f of s.vaultFiles) {
        const [m, e, mo] = f.rel_path.split("/");
        if (m === mgr) emps.set(e, emps.get(e) || 0);
      }
      for (const e of s.employees.filter((x) => x.account_manager === mgr)) {
        if (!emps.has(e.name)) emps.set(e.name, 0);
      }
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
      const mgr = decode(parts[2]);
      const emp = decode(parts[4]);
      const months = /* @__PURE__ */ new Map();
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
      const mgr = decode(parts[2]);
      const emp = decode(parts[4]);
      const month = decode(parts[6]);
      const prefix = mgr + "/" + emp + "/" + month + "/";
      return json(res, 200, s.vaultFiles.filter((f) => f.rel_path.startsWith(prefix)).map(({ pdfKey, ...rest }) => rest));
    }
    if (parts[1] === "managers" && parts[5] === "months" && parts[7] === "files" && method === "POST") {
      const buf = await readBody(req);
      const names = parseMultipartFilenames(buf, req.headers["content-type"]);
      const mgr = decode(parts[2]);
      const emp = decode(parts[4]);
      const month = decode(parts[6]);
      const created = names.map((name) => {
        const rel = mgr + "/" + emp + "/" + month + "/" + name;
        const item = { name, rel_path: rel, size: 3e3, content_type: "application/pdf", stored_at: (/* @__PURE__ */ new Date()).toISOString(), pdfKey: "generic" };
        s.vaultFiles.push(item);
        const { pdfKey, ...rest } = item;
        return rest;
      });
      return json(res, 200, created);
    }
    if (parts[1] === "projects" && method === "GET" && parts.length === 2) {
      const map = /* @__PURE__ */ new Map();
      for (const e of s.employees) if (e.project) map.set(e.project, (map.get(e.project) || 0) + 1);
      return json(res, 200, [...map.entries()].map(([name, employee_count]) => ({ name, employee_count })));
    }
    if (parts[1] === "projects" && parts[3] === "employees" && method === "GET") {
      const project = decode(parts[2]);
      return json(res, 200, s.employees.filter((e) => e.project === project).map((e) => ({
        employee_pk: e.id,
        employee_id: e.employee_id,
        name: e.name,
        project: e.project,
        location: e.location,
        account_manager: e.account_manager || "",
        employee_folder: e.name,
        month_count: 1
      })));
    }
    if (parts[1] === "locations" && method === "GET" && parts.length === 2) {
      const map = /* @__PURE__ */ new Map();
      for (const e of s.employees) if (e.location) map.set(e.location, (map.get(e.location) || 0) + 1);
      return json(res, 200, [...map.entries()].map(([name, employee_count]) => ({ name, employee_count })));
    }
    if (parts[1] === "locations" && parts[3] === "employees" && method === "GET") {
      const location = decode(parts[2]);
      return json(res, 200, s.employees.filter((e) => e.location === location).map((e) => ({
        employee_pk: e.id,
        employee_id: e.employee_id,
        name: e.name,
        project: e.project,
        location: e.location,
        account_manager: e.account_manager || "",
        employee_folder: e.name,
        month_count: 1
      })));
    }
    if (parts[1] === "search-employees" && method === "GET") {
      const qq = (query.get("q") || "").toLowerCase();
      return json(res, 200, s.employees.filter(
        (e) => e.name.toLowerCase().includes(qq) || e.employee_id.toLowerCase().includes(qq) || (e.project || "").toLowerCase().includes(qq)
      ).map((e) => ({
        employee_pk: e.id,
        employee_id: e.employee_id,
        name: e.name,
        project: e.project,
        location: e.location,
        account_manager: e.account_manager || "",
        employee_folder: e.name,
        month_count: 1
      })));
    }
    if (parts[1] === "employee-vault" && parts[3] === "months" && method === "GET") {
      const emp = s.employees.find((e) => e.id === decode(parts[2]));
      if (!emp) return json(res, 200, []);
      const months = /* @__PURE__ */ new Map();
      for (const f of s.vaultFiles) {
        if (f.rel_path.includes("/" + emp.name + "/")) {
          const mo = f.rel_path.split("/")[2];
          months.set(mo, (months.get(mo) || 0) + 1);
        }
      }
      return json(res, 200, [...months.entries()].map(([name, file_count]) => ({
        name,
        rel_path: (emp.account_manager || "") + "/" + emp.name + "/" + name,
        file_count
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
      const files = s.vaultFiles.length;
      const bytes = s.vaultFiles.reduce((a, f) => a + f.size, 0);
      return json(res, 200, { files, bytes });
    }
    if (parts[1] === "download-zip" && method === "GET") {
      res.writeHead(200, { "Content-Type": "application/zip", "Content-Disposition": "attachment; filename=vault.zip" });
      return res.end(Buffer.from("PK" + "\0".repeat(18)));
    }
    if (parts[1] === "years" && method === "GET") {
      const { year } = currentPeriod();
      return json(res, 200, [{ year, files: s.vaultFiles.length, bytes: s.vaultFiles.reduce((a, f) => a + f.size, 0) }, { year: year - 1, files: 2, bytes: 8e3 }]);
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
        else {
          f.rel_path = body.dst_rel_path;
          f.name = body.dst_rel_path.split("/").pop() || f.name;
        }
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
  if (parts[0] === "upload") {
    if (parts[1] === "stream" && method === "POST") {
      const buf = await readBody(req);
      const names = parseMultipartFilenames(buf, req.headers["content-type"]);
      const { month, year } = currentPeriod();
      const staged = names.map((filename) => {
        const id = nextId("pipe");
        const item = {
          id,
          filename,
          content_type: "application/pdf",
          size_bytes: 3e3,
          source_kind: "upload",
          source_id: null,
          attachment_id: null,
          status: "needs_review",
          stage: "staged",
          failure_code: null,
          failure_label: null,
          failure_detail: null,
          events: [{ stage: "upload", status: "ok", detail: "Uploaded", at: (/* @__PURE__ */ new Date()).toISOString() }],
          employee_id: "E1007",
          employee_name: "Mei Ling",
          month,
          year,
          record_id: null,
          extraction_model: "demo-gpt",
          extraction_method: "vision",
          used_ocr: false,
          extraction_meta: { staged: { employee_pk: "emp-007", matched_name: "Mei Ling", matched_employee_id: "E1007", month, year, buckets: {}, auto_accept: true } },
          auto_accepted: true,
          can_retry: true,
          can_resolve_assign: true,
          resolved_at: null,
          resolution_note: null,
          created_at: (/* @__PURE__ */ new Date()).toISOString(),
          updated_at: (/* @__PURE__ */ new Date()).toISOString(),
          pdfKey: "generic"
        };
        s.pipeline.unshift(item);
        return stripPipe(item);
      });
      await streamExtractionDemo(res, { staged, groups: staged.length, message: "Upload extraction complete" });
      return;
    }
    if (parts[1] === "manual" && method === "POST") {
      const buf = await readBody(req);
      const text2 = buf.toString("utf8");
      const get = (name) => {
        const m = new RegExp('name="' + name + '"[\\r\\n]+([\\s\\S]*?)(?:\\r?\\n--)').exec(text2);
        return m ? m[1].trim() : "";
      };
      const emp = s.employees.find((e) => e.id === get("employee_pk"));
      const month = Number(get("month"));
      const year = Number(get("year"));
      let buckets = {};
      try {
        buckets = JSON.parse(get("buckets") || "{}");
      } catch {
        buckets = {};
      }
      const recId = nextId("rec");
      const pipeId = nextId("pipe");
      const rec = {
        id: recId,
        matched_employee_pk: emp?.id ?? null,
        employee_id: emp?.employee_id ?? null,
        employee_name: emp?.name ?? null,
        account_manager: emp?.account_manager ?? null,
        dco_number: emp?.dco_number ?? null,
        match_note: "Manual upload",
        month,
        year,
        calendar_days: 30,
        annual_leave_dates: buckets.annual_leave || [],
        remote_work_dates: buckets.remote_work || [],
        sick_leave_dates: buckets.sick_leave || [],
        maternity_leave_dates: [],
        unpaid_leave_dates: [],
        absent_dates: [],
        public_holiday_dates: [],
        other_leave_dates: [],
        working_dates: buckets.working || [],
        weekend_dates: buckets.weekend || [],
        annual_leave_count: 0,
        remote_work_count: 0,
        sick_leave_count: 0,
        maternity_leave_count: 0,
        unpaid_leave_count: 0,
        absent_count: 0,
        public_holiday_count: 0,
        other_leave_count: 0,
        working_dates_count: 0,
        weekend_dates_count: 0,
        validation_status: "manual_review",
        llm_summary: get("note") || "Manual",
        hr_flags: [],
        approval_detected: false,
        approval_detail: null,
        approval_status: "pending",
        source_email_id: null,
        storage_folder: null,
        source_files: [],
        source_file_count: 0
      };
      recount(rec);
      s.records.push(rec);
      s.pipeline.unshift({
        id: pipeId,
        filename: "manual.pdf",
        content_type: "application/pdf",
        size_bytes: 3e3,
        source_kind: "manual",
        source_id: null,
        attachment_id: null,
        status: "success",
        stage: "filed",
        failure_code: null,
        failure_label: null,
        failure_detail: null,
        events: [{ stage: "manual", status: "ok", detail: "OK", at: (/* @__PURE__ */ new Date()).toISOString() }],
        employee_id: emp?.employee_id ?? null,
        employee_name: emp?.name ?? null,
        month,
        year,
        record_id: recId,
        extraction_model: null,
        extraction_method: "manual",
        used_ocr: false,
        extraction_meta: null,
        auto_accepted: false,
        can_retry: false,
        can_resolve_assign: false,
        resolved_at: null,
        resolution_note: null,
        created_at: (/* @__PURE__ */ new Date()).toISOString(),
        updated_at: (/* @__PURE__ */ new Date()).toISOString(),
        pdfKey: "generic"
      });
      return json(res, 200, {
        pipeline_id: pipeId,
        filename: "manual.pdf",
        status: "success",
        failure_code: null,
        failure_detail: null,
        record_id: recId,
        employee_name: emp?.name ?? null,
        employee_id: emp?.employee_id ?? null,
        month,
        year,
        validation_status: "manual_review",
        llm_summary: rec.llm_summary,
        match_note: rec.match_note
      });
    }
  }
  if (parts[0] === "bulk-upload") {
    const { month, year } = currentPeriod();
    if (parts[1] === "preview" && method === "POST") {
      await readBody(req);
      return json(res, 200, {
        filename: "roster.xlsx",
        method: "xlsx-cells",
        month: Number(query.get("month") || month),
        year: Number(query.get("year") || year),
        calendar_days: 30,
        agency: "Demo Agency",
        headcount: 3,
        matched: 2,
        unmatched: 1,
        flagged: 0,
        llm_calls: 0,
        issues: [],
        rows: [
          { sr_no: 1, name: "Mei Ling", title: "Engineer", location: "Dubai", confirmation: "OK", stated_leave_days: 2, stated_billing_days: 20, leave_days_read: 2, working_days_read: 20, weekend_days_read: 8, uncertain_days: 0, matched_name: "Mei Ling", matched_employee_id: "E1007", issues: [] },
          { sr_no: 2, name: "Carlos Mendes", title: "Analyst", location: "Dubai", confirmation: "OK", stated_leave_days: 0, stated_billing_days: 22, leave_days_read: 0, working_days_read: 22, weekend_days_read: 8, uncertain_days: 0, matched_name: "Carlos Mendes", matched_employee_id: "E1008", issues: [] },
          { sr_no: 3, name: "Unknown Person", title: null, location: null, confirmation: null, stated_leave_days: 1, stated_billing_days: 19, leave_days_read: 1, working_days_read: 19, weekend_days_read: 8, uncertain_days: 1, matched_name: null, matched_employee_id: null, issues: ["Unmatched"] }
        ]
      });
    }
    if (method === "POST") {
      await readBody(req);
      const m = Number(query.get("month") || month);
      const y = Number(query.get("year") || year);
      for (const name of ["Mei_Ling_roster.pdf", "Carlos_Mendes_roster.pdf"]) {
        s.pipeline.unshift({
          id: nextId("pipe"),
          filename: name,
          content_type: "application/pdf",
          size_bytes: 2500,
          source_kind: "upload",
          source_id: null,
          attachment_id: null,
          status: "needs_review",
          stage: "staged",
          failure_code: null,
          failure_label: null,
          failure_detail: null,
          events: [{ stage: "roster", status: "ok", detail: "Staged from roster", at: (/* @__PURE__ */ new Date()).toISOString() }],
          employee_id: name.startsWith("Mei") ? "E1007" : "E1008",
          employee_name: name.startsWith("Mei") ? "Mei Ling" : "Carlos Mendes",
          month: m,
          year: y,
          record_id: null,
          extraction_model: null,
          extraction_method: "xlsx-cells",
          used_ocr: false,
          extraction_meta: { staged: { buckets: {} } },
          auto_accepted: false,
          can_retry: true,
          can_resolve_assign: true,
          resolved_at: null,
          resolution_note: null,
          created_at: (/* @__PURE__ */ new Date()).toISOString(),
          updated_at: (/* @__PURE__ */ new Date()).toISOString(),
          pdfKey: "generic"
        });
      }
      return json(res, 200, { filename: "roster.xlsx", headcount: 3, staged: 2, matched: 2, unmatched: ["Unknown Person"], flagged: 0, month: m, year: y, method: "xlsx-cells", issues: [] });
    }
  }
  if (parts[0] === "reminders") {
    if (parts[1] === "config" && method === "GET") return json(res, 200, s.reminderConfig);
    if (parts[1] === "config" && method === "PUT") {
      const body = await readJson(req);
      Object.assign(s.reminderConfig, body, { updated_at: (/* @__PURE__ */ new Date()).toISOString(), updated_by: "admin" });
      return json(res, 200, s.reminderConfig);
    }
    if (parts[1] === "employees" && method === "GET") {
      const month = Number(query.get("month"));
      const year = Number(query.get("year"));
      let rows = s.employees.filter((e) => e.active).map((e) => {
        const has = s.records.some((r) => r.matched_employee_pk === e.id && r.month === month && r.year === year);
        return {
          employee_pk: e.id,
          employee_id: e.employee_id,
          name: e.name,
          account_manager: e.account_manager,
          location: e.location,
          email: e.work_email,
          email_source: "work",
          missing: !has,
          last_status: null,
          last_sent_at: null,
          last_trigger: null,
          last_error: null
        };
      });
      if (query.get("only_missing") === "true") rows = rows.filter((r) => r.missing);
      if (query.get("q")) {
        const qq = query.get("q").toLowerCase();
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
        id: nextId("rlog"),
        run_id: null,
        employee_pk: emp?.id ?? null,
        employee_id: emp?.employee_id ?? null,
        employee_name: emp?.name ?? null,
        recipient_email: emp?.work_email ?? null,
        month: body.month,
        year: body.year,
        trigger: "manual",
        status: "sent",
        error: null,
        sent_at: (/* @__PURE__ */ new Date()).toISOString(),
        created_at: (/* @__PURE__ */ new Date()).toISOString()
      };
      return json(res, 200, log);
    }
    if (parts[1] === "test" && method === "POST") {
      const body = await readJson(req);
      return json(res, 200, {
        id: nextId("rlog"),
        run_id: null,
        employee_pk: null,
        employee_id: null,
        employee_name: body.employee_name || "Test Employee",
        recipient_email: body.email,
        month: body.month,
        year: body.year,
        trigger: "test",
        status: "sent",
        error: null,
        sent_at: (/* @__PURE__ */ new Date()).toISOString(),
        created_at: (/* @__PURE__ */ new Date()).toISOString()
      });
    }
    if (parts[1] === "run-batch" && method === "POST") {
      const body = await readJson(req);
      const { month, year } = currentPeriod();
      const id = nextId("rrun");
      s.reminderRuns.unshift({
        id,
        trigger: "manual_batch",
        month: body.month || month,
        year: body.year || year,
        started_at: (/* @__PURE__ */ new Date()).toISOString(),
        finished_at: (/* @__PURE__ */ new Date()).toISOString(),
        total: 2,
        sent_count: 2,
        failed_count: 0,
        skipped_count: 0,
        triggered_by: "admin",
        logs: []
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
          cal = { id: nextId("cal"), ...body, created_at: (/* @__PURE__ */ new Date()).toISOString(), updated_at: (/* @__PURE__ */ new Date()).toISOString() };
          s.calendars.push(cal);
        } else {
          Object.assign(cal, body, { updated_at: (/* @__PURE__ */ new Date()).toISOString() });
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
        const u = { id: nextId("portal"), username: body.username, password: body.password, role: "employee", employee_pk: body.employee_pk, employee_name: emp?.name ?? null, employee_id: emp?.employee_id ?? null, is_active: true, last_login_at: null };
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
        const limit = Number(query.get("limit") || 50);
        const offset = Number(query.get("offset") || 0);
        const summaries = s.debugRuns.map(({ pass1_calls, pass2_calls, dropped_items, triage, sheets, errors, ...sum }) => sum);
        return json(res, 200, summaries.slice(offset, offset + limit));
      }
      if (parts[2] === "runs" && parts[3] && method === "GET") {
        const run = s.debugRuns.find((r) => r.id === parts[3]);
        if (!run) return json(res, 404, { detail: "Not found" });
        return json(res, 200, run);
      }
      if (parts[2] === "runs" && method === "DELETE") {
        const n = s.debugRuns.length;
        s.debugRuns.length = 0;
        return json(res, 200, { deleted: n });
      }
      if (parts[2] === "image" && method === "GET") {
        return sendPdf(res, getPdf("generic"), "debug.pdf");
      }
    }
  }
  return json(res, 501, { detail: "mock: not implemented " + path });
}

// mock/vercelHandler.ts
function requestUrl(req) {
  const sub = req.query?.__sub;
  if (sub !== void 0) {
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
  const fromHeader = typeof h["x-vercel-original-url"] === "string" && h["x-vercel-original-url"] || typeof h["x-invoke-path"] === "string" && h["x-invoke-path"] || typeof h["x-forwarded-uri"] === "string" && h["x-forwarded-uri"];
  if (fromHeader) {
    return fromHeader.startsWith("/") ? fromHeader : `/${fromHeader}`;
  }
  const raw = req.url || "/";
  if (raw.startsWith("/api/v1")) return raw;
  return raw;
}
function runMockOnVercel(req, res) {
  req.url = requestUrl(req);
  mockMiddleware(req, res, () => {
    if (!res.headersSent) {
      res.statusCode = 404;
      res.end("Not found");
    }
  });
}

// mock/vercel-mock-entry.ts
function handler(req, res) {
  runMockOnVercel(req, res);
}
var config = {
  api: { bodyParser: false },
  maxDuration: 30
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  config
});
