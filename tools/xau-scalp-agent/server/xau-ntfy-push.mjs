#!/usr/bin/env node
/**
 * Push important XAU alerts to ntfy (phone). Called each loop tick when XAU_NTFY=1.
 */
import fs from "node:fs";
import { getContextPath } from "./xau-store.js";
import { sendNtfy, showNtfySetup } from "./xau-ntfy.mjs";

function readContext() {
  const p = getContextPath();
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function collectAlerts(ctx) {
  const out = [];

  if (ctx.watchRevoked?.notify && ctx.watchRevoked?.chatDoNotEnter) {
    out.push({
      eventKey: `revoke:${ctx.watchRevoked.revokedAt}:${ctx.watchRevoked.previous?.direction || "?"}`,
      title: "XAU - stand down",
      body: ctx.watchRevoked.chatDoNotEnter,
      priority: "high",
      tags: "octagonal_sign",
    });
  }

  if (ctx.newWatchIssued && ctx.activeWatch?.active) {
    const aw = ctx.activeWatch;
    const body =
      ctx.tradePlan?.chatDraft ||
      `WATCH ONLY ${aw.direction?.toUpperCase() || ""} band $${aw.entryLow}–$${aw.entryHigh} stop $${aw.stop} TP1 $${aw.tp1}`;
    out.push({
      eventKey: `watch:${aw.issuedAt}:${aw.fingerprint?.direction}:${aw.fingerprint?.stop}`,
      title: "XAU - WATCH ONLY (prepare)",
      body,
      priority: "high",
      tags: "chart_with_upwards_trend",
    });
  }

  if (ctx.ok === false) {
    out.push({
      eventKey: `bridge:${ctx.ts || "err"}`,
      title: "XAU - bridge error",
      body: "Chrome extension / TradingView tabs — check bridge.",
      priority: "high",
      tags: "warning",
    });
  }

  return out;
}

/** @param {{ decision: string, signalId?: string, reason?: string, entryLow?: number, stop?: number, tp1?: number }} ev */
export async function pushEnterEvaluation(ev) {
  if (ev.decision !== "ENTER") return { ok: true, skipped: true };
  const parts = [
    ev.reason || "All hard filters passed — recommendation only, you execute on MT5.",
    ev.entryLow != null ? `Entry ~$${ev.entryLow}` : null,
    ev.stop != null ? `Stop $${ev.stop}` : null,
    ev.tp1 != null ? `TP1 $${ev.tp1}` : null,
  ].filter(Boolean);
  return sendNtfy({
    eventKey: `enter:${ev.signalId || ev.reason}`,
    title: "XAU - ENTER (review now)",
    body: parts.join(" · "),
    priority: "urgent",
    tags: "rotating_light",
  });
}

async function main() {
  if (process.argv.includes("--setup")) {
    showNtfySetup();
    return;
  }

  if (process.argv.includes("--test")) {
    const r = await sendNtfy({
      eventKey: `test:${Date.now()}`,
      title: "XAU - test ping",
      body: "If you see this on your phone, ntfy is wired correctly.",
      priority: "default",
      tags: "white_check_mark",
    });
    console.log(JSON.stringify(r));
    if (r.ok && !r.skipped) showNtfySetup();
    return;
  }

  const ctx = readContext();
  if (!ctx) {
    console.error("No context.json");
    process.exit(1);
  }

  const alerts = collectAlerts(ctx);
  const results = [];
  for (const a of alerts) {
    results.push({ ...a, result: await sendNtfy(a) });
  }

  if (results.length) {
    console.log("XAU_NTFY_PUSH", JSON.stringify(results.map((r) => r.result)));
  }
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: err.message }));
  process.exit(1);
});
