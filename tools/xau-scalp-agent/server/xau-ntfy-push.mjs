#!/usr/bin/env node
/**
 * Push important XAU alerts to ntfy (phone). Called each loop tick when XAU_NTFY=1.
 */
import fs from "node:fs";
import { getContextPath } from "./xau-store.js";
import { sendNtfy, showNtfySetup } from "./xau-ntfy.mjs";
import {
  formatWatchCancelledNtfy,
  formatWatchNtfy,
  formatWatchNtfyTitle,
} from "./xau-user-messages.mjs";

function readContext() {
  const p = getContextPath();
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function collectAlerts(ctx) {
  const out = [];

  if (ctx.watchRevoked?.notify && ctx.watchRevoked?.chatDoNotEnter) {
    const prev = ctx.watchRevoked.previous ?? {};
    const revokeMid = ctx.watchRevoked.mid ?? ctx.dataIntegrity?.m5Mid ?? ctx.m5?.c ?? null;
    const eventType = ctx.watchRevoked.eventType ?? "revoke";
    const info = {
      ...prev,
      mid: revokeMid,
      eventType,
      adverseDetail: ctx.watchRevoked.adverseDetail ?? null,
      revokeReasons: ctx.watchRevoked.reasons,
    };
    const isUrgent = eventType === "reversal_warning" || eventType === "stop_broken";
    out.push({
      eventKey: `lifecycle:${eventType}:${ctx.watchRevoked.revokedAt}:${prev.direction || "?"}`,
      title: formatWatchNtfyTitle(info),
      body: formatWatchCancelledNtfy(info),
      priority: isUrgent ? "urgent" : "high",
      tags:
        eventType === "tp1_hit"
          ? "tada"
          : eventType === "hold_favorable"
            ? "muscle"
            : eventType === "reversal_warning"
              ? "rotating_light"
              : "octagonal_sign",
    });
  }

  if (ctx.newWatchIssued && ctx.activeWatch?.active) {
    const aw = ctx.activeWatch;
    out.push({
      eventKey: `watch:${aw.issuedAt}:${aw.fingerprint?.direction}:${aw.fingerprint?.stop}`,
      title: "XAU: Get ready",
      body: formatWatchNtfy(aw),
      priority: "high",
      tags: "chart_with_upwards_trend",
    });
  }

  if (ctx.ok === false) {
    out.push({
      eventKey: `bridge:${ctx.ts || "err"}`,
      title: "XAU: Charts not connected",
      body: "Open 5m + 15m tabs and check the Chrome extension / bridge.",
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
    ev.reason || "Review the chart — agent suggests entry; you trade on MT5.",
    ev.entryLow != null ? `Zone ~$${ev.entryLow}` : null,
    ev.stop != null ? `Stop $${ev.stop}` : null,
    ev.tp1 != null ? `Target $${ev.tp1}` : null,
  ].filter(Boolean);
  return sendNtfy({
    eventKey: `enter:${ev.signalId || ev.reason}`,
    title: "XAU: Possible entry - review",
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

  if (process.argv.includes("--test-all")) {
    const t = Date.now();
    const samples = [
      {
        eventKey: `test-all:ready:${t}`,
        title: "XAU: Get ready",
        body: formatWatchNtfy({
          direction: "long",
          entryLow: 4035.4,
          entryHigh: 4037.59,
          stop: 4034.6,
          tp1: 4041.35,
          tp2: 4044.91,
        }),
        priority: "high",
        tags: "chart_with_upwards_trend",
      },
      {
        eventKey: `test-all:hold:${t}`,
        title: formatWatchNtfyTitle({ direction: "long", eventType: "hold_favorable" }),
        body: formatWatchCancelledNtfy({
          direction: "long",
          entryLow: 4035.4,
          entryHigh: 4037.59,
          stop: 4034.6,
          tp1: 4041.35,
          mid: 4039.8,
          eventType: "hold_favorable",
        }),
        priority: "high",
        tags: "muscle",
      },
      {
        eventKey: `test-all:rev:${t}`,
        title: formatWatchNtfyTitle({ direction: "long", eventType: "reversal_warning" }),
        body: formatWatchCancelledNtfy({
          direction: "long",
          entryLow: 4035.4,
          entryHigh: 4037.59,
          stop: 4034.6,
          tp1: 4041.35,
          mid: 4039.37,
          eventType: "reversal_warning",
          adverseDetail: "Pulled back from $4041.86 to $4039.37 with 15m trend down",
        }),
        priority: "urgent",
        tags: "rotating_light",
      },
      {
        eventKey: `test-all:tp1:${t}`,
        title: formatWatchNtfyTitle({ direction: "long", eventType: "tp1_hit" }),
        body: formatWatchCancelledNtfy({
          direction: "long",
          entryLow: 4035.4,
          entryHigh: 4037.59,
          stop: 4034.6,
          tp1: 4041.35,
          mid: 4041.5,
          eventType: "tp1_hit",
        }),
        priority: "high",
        tags: "tada",
      },
      {
        eventKey: `test-all:stop:${t}`,
        title: formatWatchNtfyTitle({ direction: "long", eventType: "stop_broken" }),
        body: formatWatchCancelledNtfy({
          direction: "long",
          entryLow: 4035.4,
          entryHigh: 4037.59,
          stop: 4034.6,
          tp1: 4041.35,
          mid: 4034.5,
          eventType: "stop_broken",
        }),
        priority: "urgent",
        tags: "octagonal_sign",
      },
    ];
    const results = [];
    for (const a of samples) {
      results.push(await sendNtfy(a));
      await new Promise((r) => setTimeout(r, 800));
    }
    console.log(JSON.stringify({ ok: true, sent: results.length, results }));
    return;
  }

  if (process.argv.includes("--test")) {
    const r = await sendNtfy({
      eventKey: `test:${Date.now()}`,
      title: "XAU: Test OK",
      body: "If you see this, phone alerts are working.",
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
