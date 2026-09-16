/**
 * Generate real, previewable PDF timesheets (valid PDF-1.4) and PNG approvals
 * for the frontend-only demo — no external deps.
 */

const MONTHS = [
  "", "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function dateIso(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export type TimesheetLeaveOpts = {
  employeeId?: string;
  project?: string;
  manager?: string;
  annualLeave?: number[];
  sickLeave?: number[];
  remoteWork?: number[];
};

/** Same day classification the PDF grid prints — Compare & Fix must match this. */
export function buildAttendance(
  year: number,
  month: number,
  opts?: Pick<TimesheetLeaveOpts, "annualLeave" | "sickLeave" | "remoteWork">,
) {
  const nDays = daysInMonth(year, month);
  const annualWant = new Set(opts?.annualLeave ?? [3, 4]);
  const sickWant = new Set(opts?.sickLeave ?? []);
  const remoteWant = new Set(opts?.remoteWork ?? [8, 9]);
  const annual_leave: string[] = [];
  const sick_leave: string[] = [];
  const remote_work: string[] = [];
  const working_days: string[] = [];
  const weekend_days: string[] = [];

  for (let day = 1; day <= nDays; day++) {
    const iso = dateIso(year, month, day);
    const dow = new Date(year, month - 1, day).getDay(); // 0=Sun … 6=Sat (matches PDF grid)
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

export function stagedFromAttendance(
  year: number,
  month: number,
  emp: { id: string; name: string; employee_id: string } | null,
  opts?: Pick<TimesheetLeaveOpts, "annualLeave" | "sickLeave" | "remoteWork">,
  flags: string[] = [],
) {
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
      maternity: [] as string[],
      unpaid: [] as string[],
      absent: [] as string[],
      public_holiday: [] as string[],
      other: [] as string[],
    },
    working_days: a.working_days,
    weekend_days: a.weekend_days,
    flags,
    auto_accept: !!emp && flags.length === 0,
  };
}

type DrawCmd = string;

function text(x: number, y: number, size: number, s: string, font = "/F1"): DrawCmd {
  return `BT ${font} ${size} Tf ${x.toFixed(1)} ${y.toFixed(1)} Td (${esc(s)}) Tj ET`;
}

function rect(x: number, y: number, w: number, h: number, fill = false): DrawCmd {
  return `${x.toFixed(1)} ${y.toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)} re ${fill ? "f" : "S"}`;
}

function line(x1: number, y1: number, x2: number, y2: number): DrawCmd {
  return `${x1.toFixed(1)} ${y1.toFixed(1)} m ${x2.toFixed(1)} ${y2.toFixed(1)} l S`;
}

function gray(g: number): DrawCmd {
  return `${g.toFixed(3)} g`;
}

function strokeGray(g: number): DrawCmd {
  return `${g.toFixed(3)} G`;
}

function buildPdfFromContent(stream: string, pageW = 612, pageH = 792): Buffer {
  const objects: string[] = [];
  objects.push("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
  objects.push("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n");
  objects.push(
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] ` +
      `/Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>\nendobj\n`,
  );
  objects.push(`4 0 obj\n<< /Length ${Buffer.byteLength(stream, "utf8")} >>\nstream\n${stream}\nendstream\nendobj\n`);
  objects.push("5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n");
  objects.push("6 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n");

  let pdf = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
  const offsets: number[] = [0];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf, "binary"));
    pdf += obj;
  }
  const xrefStart = Buffer.byteLength(pdf, "binary");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i <= objects.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  pdf += `startxref\n${xrefStart}\n%%EOF\n`;
  return Buffer.from(pdf, "binary");
}

/** Proper timesheet PDF: header, employee block, day grid with leave codes, totals, sign-off. */
export function makeTimesheetPdf(
  employeeName: string,
  month: number,
  year: number,
  opts?: TimesheetLeaveOpts,
): Buffer {
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

  const cmds: DrawCmd[] = [];
  cmds.push(strokeGray(0.25));
  cmds.push("1 w");

  // Header bar
  cmds.push(gray(0.12));
  cmds.push(rect(36, 742, 540, 36, true));
  cmds.push(gray(1));
  cmds.push(text(48, 754, 14, "TIMESHEET PORTAL — Monthly Attendance", "/F2"));
  cmds.push(gray(0));

  cmds.push(text(48, 720, 11, `Period: ${period}`, "/F2"));
  cmds.push(text(320, 720, 10, `Generated: ${new Date().toISOString().slice(0, 10)}`));

  // Employee info box
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

  // Legend
  cmds.push(text(48, 622, 9, "Legend:  W = Working   AL = Annual Leave   SL = Sick   RW = Remote   WE = Weekend", "/F1"));

  // Day grid — 7 columns
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
    let fill: number | null = null;
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

  // Sign-off
  const sigY = Math.max(80, summaryY - 90);
  cmds.push(strokeGray(0.4));
  cmds.push(rect(36, sigY - 10, 540, 56, false));
  cmds.push(text(48, sigY + 30, 10, "Employee declaration", "/F2"));
  cmds.push(text(48, sigY + 14, 8, `I confirm the attendance above for ${period} is accurate.`));
  cmds.push(text(48, sigY - 2, 9, `Signed: ${employeeName}`));
  cmds.push(text(320, sigY - 2, 9, `Manager approval: ${manager}`));
  cmds.push(text(48, 48, 7, "Demo timesheet PDF — Timesheets tool demo (frontend mock)"));

  return buildPdfFromContent(cmds.join("\n"));
}

export function makeSimplePdf(title: string, lines: string[]): Buffer {
  const cmds: DrawCmd[] = [];
  cmds.push(gray(0.12));
  cmds.push(rect(36, 742, 540, 36, true));
  cmds.push(gray(1));
  cmds.push(text(48, 754, 13, title, "/F2"));
  cmds.push(gray(0));
  let y = 700;
  for (const line of lines) {
    cmds.push(text(48, y, 11, line));
    y -= 18;
  }
  return buildPdfFromContent(cmds.join("\n"));
}

/** Minimal valid PNG (solid color + label via IDAT) — approval screenshot placeholder. */
export function makeApprovalPng(label = "APPROVED"): Buffer {
  // 240x80 RGB PNG — procedurally built so browsers open it as a real image.
  const w = 240;
  const h = 80;
  // Raw image: filter byte 0 + RGB per pixel (green-ish approval banner)
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    const row = y * (w * 3 + 1);
    raw[row] = 0; // filter None
    for (let x = 0; x < w; x++) {
      const i = row + 1 + x * 3;
      // emerald banner with darker border
      const border = x < 3 || x >= w - 3 || y < 3 || y >= h - 3;
      if (border) {
        raw[i] = 6; raw[i + 1] = 95; raw[i + 2] = 70;
      } else {
        raw[i] = 16; raw[i + 1] = 185; raw[i + 2] = 129;
      }
    }
  }
  // Draw a crude white "APPROVED" by punching lighter pixels in the middle band
  const chars = label.toUpperCase().slice(0, 12);
  // simple block letters — approximate center strip
  for (let y = 28; y < 52; y++) {
    for (let x = 40; x < 200; x++) {
      const on = Math.floor((x - 40) / 12) < chars.length && ((x - 40) % 12) > 2 && ((x - 40) % 12) < 9
        && ((y - 28) % 24) > 3 && ((y - 28) % 24) < 20;
      if (on) {
        const row = y * (w * 3 + 1);
        const i = row + 1 + x * 3;
        raw[i] = 255; raw[i + 1] = 255; raw[i + 2] = 255;
      }
    }
  }

  function crc32(buf: Buffer): number {
    let c = ~0;
    for (let i = 0; i < buf.length; i++) {
      c ^= buf[i];
      for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
    return ~c >>> 0;
  }

  function chunk(type: string, data: Buffer): Buffer {
    const typeBuf = Buffer.from(type, "ascii");
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const crcBuf = Buffer.concat([typeBuf, data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(crcBuf), 0);
    return Buffer.concat([len, typeBuf, data, crc]);
  }

  // zlib store (no compression) — valid for PNG
  function zlibStore(data: Buffer): Buffer {
    const blocks: Buffer[] = [];
    let offset = 0;
    while (offset < data.length) {
      const size = Math.min(65535, data.length - offset);
      const isLast = offset + size >= data.length;
      const header = Buffer.alloc(5);
      header[0] = isLast ? 0x01 : 0x00;
      header.writeUInt16LE(size, 1);
      header.writeUInt16LE(size ^ 0xffff, 3);
      blocks.push(header, data.subarray(offset, offset + size));
      offset += size;
    }
    const adler = adler32(data);
    const adlerBuf = Buffer.alloc(4);
    adlerBuf.writeUInt32BE(adler, 0);
    return Buffer.concat([Buffer.from([0x78, 0x01]), ...blocks, adlerBuf]);
  }

  function adler32(data: Buffer): number {
    let a = 1, b = 0;
    for (let i = 0; i < data.length; i++) {
      a = (a + data[i]) % 65521;
      b = (b + a) % 65521;
    }
    return ((b << 16) | a) >>> 0;
  }

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type RGB
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const idat = zlibStore(raw);
  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
