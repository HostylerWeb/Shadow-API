#!/usr/bin/env node
/**
 * Plain-language XAU status for chat (every poll).
 * Usage: node xau-agent-brief.mjs [--json]
 */
import fs from "node:fs";
import { getContextPath } from "./xau-store.js";

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
  if (!ctx) return "**XAU** — no context.json yet. Start the poll loop.";

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
  lines.push(`**XAU scalp — ${ts.replace("T", " ").slice(0, 19)} UTC**`);
  lines.push("");

  if (ctx.ok === false) {
    lines.push("**Action:** DO NOT ENTER — bridge / loop error.");
    lines.push("**Why:** Chrome extension or TradingView tabs not reachable.");
    lines.push("**When:** Fix bridge, reload extension, open 5m + 15m tabs, restart loop.");
    return lines.join("\n");
  }

  if (ctx.dataIntegrity?.ok === false) {
    const detail =
      (ctx.dataIntegrity.issues || []).join("; ") ||
      ctx.dataIntegrity.m5ArchiveNote ||
      "feed check failed";
    lines.push("**Action:** DO NOT ENTER — data not trustworthy.");
    lines.push(`**Why:** ${detail}`);
    lines.push("**When:** Move mouse off chart legends; refresh tabs; wait for `dataIntegrity.ok`.");
    lines.push("");
    lines.push(`**Price (forming):** M5 ~$${m5 ?? "?"}, M15 ~$${m15 ?? "?"}`);
    return lines.join("\n");
  }

  if (ctx.watchRevoked?.notify && ctx.watchRevoked?.chatDoNotEnter) {
    lines.push("**Action:** DO NOT ENTER — stand down from the last idea.");
    lines.push("");
    lines.push(ctx.watchRevoked.chatDoNotEnter);
    lines.push("");
    lines.push(`**Price now:** ~$${m5 ?? "?"}`);
    lines.push("**When:** Wait for a **new** watch alert (not the old levels).");
    return lines.join("\n");
  }

  if (tp.actionableWatch && tp.chatDraft && !ctx.watchSuppressed) {
    lines.push("**Action:** PREPARE ONLY — you decide on MT5 (not auto-entry).");
    lines.push("**Why:** Price in zone + plan passed watch filters + min R:R math.");
    lines.push("**When:** Enter only if the **live chart** still matches; skip if price runs away.");
    lines.push("");
    lines.push(tp.chatDraft);
    return lines.join("\n");
  }

  if (tp.chatEnterTemplate && tp.hasFreshSignal) {
    lines.push("**Action:** ENTER candidate (still you on MT5 — rare).");
    lines.push(tp.chatEnterTemplate);
    return lines.join("\n");
  }

  lines.push("**Action:** DO NOT ENTER NOW — wait.");
  lines.push("");

  const whys = [];
  if (levels.inSupportZone) {
    whys.push(`Near **support** ~$${levels.nearestSupport} (watch zone).`);
  } else if (levels.inResistanceZone) {
    whys.push(`Near **resistance** ~$${levels.nearestResistance} (watch zone).`);
  } else {
    whys.push("Not in a tight support/resistance band for a fade setup.");
  }

  if (primary.reason) {
    whys.push(`Trade math blocked: ${primary.reason}.`);
  } else if (!primary.ok && primary.meetsMinRR === false) {
    whys.push("R:R to TP1 does not meet minimum.");
  } else if (!levels.consider?.shortAtResistance && !levels.consider?.longAtSupport) {
    whys.push("No short-at-resistance / long-at-support flag this poll.");
  }

  if (levels.breakoutAboveResistance) {
    whys.push("Breakout / bull impulse — do not blindly short the top.");
  }

  const m15Bias = levels.consider?.m15Bias ?? "?";
  whys.push(`M15 bias: **${m15Bias}**.`);

  lines.push("**Why:**");
  for (const w of whys) lines.push(`- ${w}`);

  lines.push("");
  lines.push("**Price:**");
  lines.push(
    `- M5 ~$${m5 ?? "?"} · RSI ${rsi ?? "?"} · ADX ${adx ?? "?"} · spread ${spread ?? "?"} pts`,
  );
  lines.push(`- M15 ~$${m15 ?? "?"} · ADX ${ctx.m15?.adx ?? "?"}`);
  lines.push(
    `- Nearest S **$${levels.nearestSupport ?? "?"}** · R **$${levels.nearestResistance ?? "?"}**`,
  );

  lines.push("");
  lines.push("**When to reconsider:**");
  lines.push(`- Next **5m close** ~**${next5mUtcIso(ts)}** (new structure + possible signal bar).`);
  lines.push("- Enter only after a **WATCH ONLY** message with entry / stop / TP — not on silence.");
  if (news.nextHighImpact?.title && news.nextHighImpact.minutesUntil != null) {
    const m = news.nextHighImpact.minutesUntil;
    lines.push(
      `- Calendar: **${news.nextHighImpact.title}** ${m >= 0 ? `in ~${m} min` : "recently"} — ${news.inBlackout ? "in blackout window" : "note size"}.`,
    );
  }

  const showPlan = (p, label) => {
    if (p?.entryLow == null || p?.stop == null) return;
    const dir = p.direction === "short" ? "Short" : "Long";
    lines.push(
      `- ${label} ${dir} band $${p.entryLow}–$${p.entryHigh ?? p.entryLow} · stop $${p.stop}${p.tp1 ? ` · TP1 $${p.tp1}` : ""}`,
    );
  };

  if (primary.entryLow != null || tp.long?.ok || tp.short?.ok) {
    lines.push("");
    lines.push("**If setup improves (math only, not enter now):**");
    if (primary.ok) showPlan(primary, "Primary");
    else if (primary.reason) showPlan(primary, "Blocked primary");
    if (levels.inSupportZone && tp.long?.ok && primary.direction !== "long") {
      showPlan(tp.long, "Long at support");
    }
    if (levels.inResistanceZone && tp.short?.ok && primary.direction !== "short") {
      showPlan(tp.short, "Short at resistance");
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
