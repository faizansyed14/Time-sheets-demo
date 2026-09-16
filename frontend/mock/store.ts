import { buildSeed, type SeedData } from "./seed";
import { makeTimesheetPdf } from "./pdf";
import { writeFileSync, mkdirSync, existsSync, readFileSync, unlinkSync } from "fs";
import { join } from "path";

const STORE_PATH = join(process.cwd(), ".demo-store.json");
/** Vercel serverless: no writable disk — in-memory seed per warm instance. */
const serverlessDemo = !!process.env.VERCEL;

let store: SeedData | null = null;
let seq = 100;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

export function nextId(prefix: string): string {
  seq += 1;
  scheduleSave();
  return `${prefix}-${String(seq).padStart(3, "0")}`;
}

function ensurePublicDemoPdfs(s: SeedData) {
  try {
    const publicDir = join(process.cwd(), "public", "demo");
    if (!existsSync(publicDir)) mkdirSync(publicDir, { recursive: true });
    const samples: [string, Buffer][] = [
      ["aisha-timesheet.pdf", s.pdfs["ts-emp-001-" + new Date().getFullYear() + "-" + (new Date().getMonth() + 1)]
        ?? makeTimesheetPdf("Aisha Rahman", new Date().getMonth() + 1, new Date().getFullYear())],
      ["omar-timesheet.pdf", makeTimesheetPdf("Omar Hassan", new Date().getMonth() + 1, new Date().getFullYear())],
      ["demo-sheet.pdf", s.pdfs["generic"] ?? makeTimesheetPdf("Demo Employee", 1, 2026)],
    ];
    for (const [name, buf] of samples) {
      writeFileSync(join(publicDir, name), buf);
    }
  } catch {
    /* ignore */
  }
}

/** PDF buffers aren't JSON — rebuild from fresh seed, keep everything else. */
function attachPdfs(data: Omit<SeedData, "pdfs"> & { pdfs?: Record<string, Buffer> }): SeedData {
  const fresh = buildSeed();
  return { ...data, pdfs: fresh.pdfs };
}

type Persisted = {
  seq: number;
  data: Omit<SeedData, "pdfs">;
};

function stripPdfs(s: SeedData): Omit<SeedData, "pdfs"> {
  const { pdfs: _p, ...rest } = s;
  return rest;
}

export function saveStore(): void {
  if (!store || serverlessDemo) return;
  try {
    const payload: Persisted = { seq, data: stripPdfs(store) };
    writeFileSync(STORE_PATH, JSON.stringify(payload), "utf8");
  } catch (err) {
    console.warn("[demo-store] save failed", err);
  }
}

export function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    saveStore();
  }, 200);
}

function loadFromDisk(): SeedData | null {
  if (serverlessDemo) return null;
  try {
    if (!existsSync(STORE_PATH)) return null;
    const raw = JSON.parse(readFileSync(STORE_PATH, "utf8")) as Persisted;
    if (!raw?.data?.users) return null;
    seq = typeof raw.seq === "number" ? raw.seq : 100;
    return attachPdfs(raw.data);
  } catch {
    return null;
  }
}

export function getStore(): SeedData {
  if (!store) {
    store = loadFromDisk() ?? buildSeed();
    ensurePublicDemoPdfs(store);
  }
  return store;
}

/** Wipe persisted demo + reload seed defaults. */
export function resetStore(): SeedData {
  if (!serverlessDemo) {
    try {
      if (existsSync(STORE_PATH)) unlinkSync(STORE_PATH);
    } catch { /* ignore */ }
  }
  store = buildSeed();
  seq = 100;
  ensurePublicDemoPdfs(store);
  saveStore();
  return store;
}

export function getPdf(key: string | undefined | null): Buffer {
  const s = getStore();
  if (key && s.pdfs[key]) return s.pdfs[key];
  return s.pdfs["generic"] ?? makeTimesheetPdf("Demo", 1, 2026);
}

export function publicUser(u: SeedData["users"][0]) {
  const { password: _p, ...rest } = u;
  return rest;
}

export function publicPortalUser(u: SeedData["portalUsers"][0]) {
  const { password: _p, ...rest } = u;
  return rest;
}
