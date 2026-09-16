import type { ServerResponse } from "http";

export function writeSse(res: ServerResponse, data: unknown) {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Realistic Extract Email / Upload progress frames, then close. */
export async function streamExtractionDemo(res: ServerResponse, result: unknown) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  const t0 = Date.now();
  let llm = 0;
  const emit = (
    stage: string,
    status: string,
    message: string,
    data: Record<string, unknown> = {},
  ) => {
    writeSse(res, {
      stage,
      status,
      message,
      llm_calls: llm,
      elapsed_ms: Date.now() - t0,
      data,
    });
  };

  emit("start", "start", "Starting extraction…");
  await sleep(80);
  emit("unpack", "spin", "Unpacking attachments…");
  await sleep(120);
  emit("unpack", "ok", "Attachments ready", { dropped: [] });
  await sleep(80);
  emit("pass1", "spin", "Classifying thread (pass 1)…");
  llm += 1;
  await sleep(150);
  emit("pass1", "ok", "Timesheet confirmed", { confirmed: ["timesheet.pdf"] });
  await sleep(80);
  emit("pass2", "spin", "Extracting leave buckets (pass 2)…");
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

/** Stream canned chat tokens then done. */
export async function streamChatDemo(res: ServerResponse, userText: string) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  const reply =
    "This is a **demo** Ask AI reply (no real model). " +
    "You asked: \"" +
    (userText || "…").slice(0, 200) +
    "\". " +
    "In the full app this would answer timesheet questions without DB access.";

  const words = reply.split(/(\s+)/);
  for (const w of words) {
    writeSse(res, { type: "token", text: w });
    await sleep(18);
  }
  writeSse(res, { type: "done", error: null });
  res.end();
}
