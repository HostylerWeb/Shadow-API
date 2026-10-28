#!/usr/bin/env node
/**
 * Plain-language XAU status for chat (every poll).
 * Usage: node xau-agent-brief.mjs [--json]
 */
import fs from "node:fs";
import { getContextPath } from "./xau-store.js";
import { simplifyDataIssue, simplifyPlanBlockReason } from "./xau-user-messages.mjs";

function readContext() {
  const p = getContextPath();
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function next5mUtcIso(ts) {
  const d = ts ? new Date(ts) : new Date();
  const ms = 5 * 60 * 1000;
  const next = new Date(Math.ceil(d.getTime() / ms) * ms);
  return next.toISOString().slice(11, 16) + " UTC";
}

/** @param {object} ctx context.json */
export function formatUserBrief(ctx) {
  if (!ctx) return "**Gold (XAU)** — loop not running yet. Start `run-agent-loop.sh`.";

  const m5 = ctx.m5?.c;
  const m15 = ctx.m15?.c;
  const spread = ctx.m5?.spread ?? ctx.m15?.spread;
  const adx = ctx.m5?.adx;
  const rsi = ctx.m5?.rsi;
  const levels = ctx.levels ?? {};
  const tp = ctx.tradePlan ?? {};
  const primary = tp.primary ?? {};
  const news = ctx.news ?? {};
  const ts = ctx.ts ?? new Date().toISOString();

  const lines = [];
  lines.push(`**Gold (XAU) — ${ts.replace("T", " ").slice(0, 19)} UTC**`);
  lines.push("");

  if (ctx.ok === false) {
    lines.push("**No trade — charts not connected.**");
    lines.push("");
    lines.push("Fix: Chrome extension on, bridge running, 5m + 15m TradingView tabs open.");
    return lines.join("\n");
  }

  if (ctx.dataIntegrity?.ok === false) {
    const issues = (ctx.dataIntegrity.issues || []).map(simplifyDataIssue);
    const detail = issues.join(" ") || ctx.dataIntegrity.m5ArchiveNote || "Chart data failed checks.";
    lines.push("**No trade — chart data not reliable.**");
    lines.push("");
    lines.push(detail);
    lines.push("");
    lines.push(`Price now (approx): **$${m5 ?? "?"}** (5m) · **$${m15 ?? "?"}** (15m)`);
    return lines.join("\n");
  }

  if (ctx.watchRevoked?.notify && ctx.watchRevoked?.chatDoNotEnter) {
    lines.push("**No trade — last alert was cancelled.**");
    lines.push("");
    lines.push(ctx.watchRevoked.chatDoNotEnter);
    lines.push("");
    lines.push(`Price now: **~$${m5 ?? "?"}**`);
    lines.push("Wait for a **new** phone/chat alert before acting.");
    return lines.join("\n");
  }

  if (tp.actionableWatch && tp.chatDraft && !ctx.watchSuppressed) {
    lines.push("**Get ready — possible setup.**");
    lines.push("");
    lines.push("Check the live chart. Only trade if it still makes sense; skip if price ran away.");
    lines.push("");
    lines.push(tp.chatDraft);
    return lines.join("\n");
  }

  if (tp.chatEnterTemplate && tp.hasFreshSignal) {
    lines.push("**Strong setup on paper — still your call on MT5.**");
    lines.push("");
    lines.push(tp.chatEnterTemplate);
    return lines.join("\n");
  }

  lines.push("**Do nothing for now.**");
  lines.push("");

  const plain = [];
  if (levels.inSupportZone) {
    plain.push(`Price **~$${m5 ?? "?"}** is near **support ~$${levels.nearestSupport}**.`);
  } else if (levels.inResistanceZone) {
    plain.push(`Price **~$${m5 ?? "?"}** is near **resistance ~$${levels.nearestResistance}**.`);
  } else {
    plain.push(`Price **~$${m5 ?? "?"}** — not in a tight buy/sell zone.`);
  }

  const block = simplifyPlanBlockReason(primary.reason);
  if (block) {
    plain.push(block);
  } else if (!primary.ok && primary.meetsMinRR === false) {
    plain.push("Reward vs risk is too small for a plan.");
  }

  if (levels.breakoutAboveResistance) {
    plain.push("Price is pushing above resistance — do not sell just because it looks “high”.");
  }

  const bias = levels.consider?.m15Bias;
  if (bias === "bull") plain.push("15m trend: **up**.");
  else if (bias === "bear") plain.push("15m trend: **down**.");

  lines.push(plain.join(" "));

  lines.push("");
  lines.push(`5m RSI ${rsi ?? "?"} · ADX ${adx ?? "?"} · spread ${spread ?? "?"} pts`);
  lines.push(`Support **$${levels.nearestSupport ?? "?"}** · Resistance **$${levels.nearestResistance ?? "?"}**`);

  lines.push("");
  lines.push(`Next 5m candle close: **~${next5mUtcIso(ts)}**.`);
  lines.push("Trade only after a **Get ready** alert with zone, stop, and target.");

  if (news.nextHighImpact?.title && news.nextHighImpact.minutesUntil != null) {
    const m = news.nextHighImpact.minutesUntil;
    if (news.inBlackout) {
      lines.push(`News blackout: **${news.nextHighImpact.title}** — avoid new trades.`);
    } else if (m >= 0 && m < 24 * 60) {
      lines.push(`Upcoming news: **${news.nextHighImpact.title}** in ~${m} min — size carefully.`);
    }
  }

  return lines.join("\n");
}

const ctx = readContext();
const text = formatUserBrief(ctx);

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ ts: ctx?.ts, text }, null, 2));
} else {
  console.log(text);
}
