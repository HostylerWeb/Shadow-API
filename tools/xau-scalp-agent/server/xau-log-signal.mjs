#!/usr/bin/env node
/** Append one row to signals.jsonl + signal-journal.md (watch/revoke/enter). */
import { appendSignalEvent } from "./xau-signal-log.mjs";

const raw = process.argv[2];
if (!raw) {
  console.error("Usage: node xau-log-signal.mjs '<json>'");
  process.exit(1);
}
try {
  const record = JSON.parse(raw);
  appendSignalEvent(record);
  console.log(JSON.stringify({ ok: true, type: record.type, ts: record.ts }));
} catch (err) {
  console.error(JSON.stringify({ ok: false, error: err.message }));
  process.exit(1);
}
