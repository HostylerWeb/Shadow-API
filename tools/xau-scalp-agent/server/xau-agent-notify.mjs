#!/usr/bin/env node
/**
 * Deterministic chat lines from context.json (no LLM).
 * Usage: node xau-agent-notify.mjs [--json]
 * Exit 0 always; prints nothing when silent.
 */
import fs from "node:fs";
import { getContextPath } from "./xau-store.js";
import { simplifyDataIssue } from "./xau-user-messages.mjs";

function readContext() {
  const p = getContextPath();
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

const ctx = readContext();
if (!ctx) {
  console.error("No context.json");
  process.exit(1);
}

const lines = [];
const jsonOut = { ts: ctx.ts, messages: [] };

if (ctx.watchRevoked?.notify && ctx.watchRevoked?.chatDoNotEnter) {
  lines.push(ctx.watchRevoked.chatDoNotEnter);
  jsonOut.messages.push({ type: "stand_down", text: ctx.watchRevoked.chatDoNotEnter });
} else if (ctx.tradePlan?.actionableWatch && ctx.tradePlan?.chatDraft && !ctx.watchSuppressed) {
  lines.push(ctx.tradePlan.chatDraft);
  jsonOut.messages.push({ type: "watch", text: ctx.tradePlan.chatDraft });
} else if (ctx.dataIntegrity?.ok === false && (ctx.isNew5mBar || ctx.isNew15mBar)) {
  const detail = (ctx.dataIntegrity.issues || [])
    .map(simplifyDataIssue)
    .join(" ") || ctx.dataIntegrity.m5ArchiveNote || "Chart data not reliable.";
  const msg = `**No trade — bad chart data.** ${detail}`;
  lines.push(msg);
  jsonOut.messages.push({ type: "wait_data", text: msg });
} else if (ctx.ok === false) {
  lines.push("**No trade — charts not connected.** Check extension and 5m + 15m tabs.");
  jsonOut.messages.push({ type: "error", text: lines[0] });
}

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(jsonOut, null, 2));
} else {
  for (const line of lines) console.log(line);
}

process.exit(0);
