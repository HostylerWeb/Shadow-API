#!/usr/bin/env node
/** Append one agent evaluation row and mark signal processed. */
import { appendEvaluation } from "./xau-signal.js";
import { pushEnterEvaluation } from "./xau-ntfy-push.mjs";

const raw = process.argv[2];
if (!raw) {
  console.error("Usage: node xau-log-evaluation.mjs '<json>'");
  process.exit(1);
}
try {
  const record = JSON.parse(raw);
  appendEvaluation(record);
  if (process.env.XAU_NTFY !== "0") {
    pushEnterEvaluation(record).catch(() => {});
  }
  console.log(JSON.stringify({ ok: true, signalId: record.signalId, decision: record.decision }));
} catch (err) {
  console.error(JSON.stringify({ ok: false, error: err.message }));
  process.exit(1);
}
