/**
 * Support / resistance from closed bars + optional manual levels.
 * Written to context.json each poll — agent must use this, not infer levels.
 */
import fs from "node:fs";
import path from "node:path";
import { readAutoLevels } from "./xau-agent-feed.mjs";

function numEnv(name, fallback) {
  const v = process.env[name];
  if (v == null || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function readJsonlTail(filePath, maxLines = 32) {
  if (!filePath || !fs.existsSync(filePath)) return [];
  const lines = fs.readFileSync(filePath, "utf8").split("\n").filter(Boolean);
  const slice = lines.slice(-maxLines);
  const out = [];
  for (const line of slice) {
    try {
      out.push(JSON.parse(line));
    } catch {
      /* skip */
    }
  }
  return out;
}

function readManualLevels(stateDir) {
  const p = path.join(stateDir, "levels.json");
  if (!fs.existsSync(p)) return { supports: [], resistances: [] };
  try {
    const j = JSON.parse(fs.readFileSync(p, "utf8"));
    const supports = Array.isArray(j.supports) ? j.supports.filter(Number.isFinite) : [];
    const resistances = Array.isArray(j.resistances)
      ? j.resistances.filter(Number.isFinite)
      : [];
    return { supports, resistances };
  } catch {
    return { supports: [], resistances: [] };
  }
}

/** Study §3.4 — pivot with 2 bars left and 2 right (indices in array). */
export function confirmedM5Swings(bars, pivotBars = 2) {
  const highs = [];
  const lows = [];
  if (!bars?.length || bars.length < pivotBars * 2 + 1) {
    return { swingHighs: highs, swingLows: lows };
  }
  for (let i = pivotBars; i < bars.length - pivotBars; i += 1) {
    const b = bars[i];
    if (b.h == null || b.l == null) continue;
    let isHigh = true;
    let isLow = true;
    for (let k = 1; k <= pivotBars; k += 1) {
      if (bars[i - k].h == null || bars[i + k].h == null || b.h <= bars[i - k].h || b.h <= bars[i + k].h) {
        isHigh = false;
      }
      if (bars[i - k].l == null || bars[i + k].l == null || b.l >= bars[i - k].l || b.l >= bars[i + k].l) {
        isLow = false;
      }
    }
    if (isHigh) highs.push({ price: b.h, barKey: b.barKey, bucket: b.bucket });
    if (isLow) lows.push({ price: b.l, barKey: b.barKey, bucket: b.bucket });
  }
  return { swingHighs: highs, swingLows: lows };
}

function m15BiasFromBar(bar) {
  if (!bar || bar.ema20 == null || bar.ema50 == null || bar.c == null) return "unknown";
  const bull = bar.ema20 >= bar.ema50 && bar.c > bar.ema20 && bar.c > bar.ema50;
  const bear = bar.ema20 <= bar.ema50 && bar.c < bar.ema20 && bar.c < bar.ema50;
  if (bull) return "bull";
  if (bear) return "bear";
  return "neutral";
}

function closeLocationRatio(bar) {
  if (!bar || bar.h == null || bar.l == null || bar.c == null) return null;
  const range = bar.h - bar.l;
  if (range <= 0) return 0.5;
  return (bar.c - bar.l) / range;
}

function nearestAbove(price, levels) {
  let best = null;
  for (const lv of levels) {
    if (lv == null || !Number.isFinite(lv)) continue;
    if (lv <= price) continue;
    if (best == null || lv < best) best = lv;
  }
  return best;
}

function nearestBelow(price, levels) {
  let best = null;
  for (const lv of levels) {
    if (lv == null || !Number.isFinite(lv)) continue;
    if (lv >= price) continue;
    if (best == null || lv > best) best = lv;
  }
  return best;
}

/**
 * @param {object} opts
 * @param {string} opts.bars5mPath
 * @param {string} opts.bars15mPath
 * @param {string} opts.stateDir
 * @param {object|null} opts.formingM5
 * @param {object|null} [opts.formingM15]
 * @param {object|null} opts.closedM5 — last archived bar (on new 5m roll)
 */
export function computeLevelsContext({
  bars5mPath,
  bars15mPath,
  stateDir,
  formingM5,
  formingM15 = null,
  closedM5 = null,
}) {
  const zoneAtrMult = numEnv("XAU_LEVELS_ZONE_ATR_MULT", 0.4);
  const m5RangeBars = numEnv("XAU_LEVELS_M5_RANGE_BARS", 12);
  const m5ReadMax = numEnv("XAU_LEVELS_M5_READ_MAX", 32);

  const bars5 = readJsonlTail(bars5mPath, m5ReadMax);
  const bars15 = readJsonlTail(bars15mPath, 8);
  const m15Bar = bars15.length ? bars15[bars15.length - 1] : null;
  const manual = readManualLevels(stateDir);
  const auto = readAutoLevels(stateDir);
  const agentFeed = formingM5?.agentFeed ?? auto.agentFeed ?? null;

  /** Exclude current signal bar if already appended to bars5 so resistance/support aren't self-referential. */
  const historyBars5 =
    closedM5 && bars5.length && bars5[bars5.length - 1]?.barKey === closedM5.barKey
      ? bars5.slice(0, -1)
      : bars5;

  const { swingHighs, swingLows } = confirmedM5Swings(historyBars5);
  const rangeSlice = historyBars5.slice(-m5RangeBars);
  let m5RangeHigh = null;
  let m5RangeLow = null;
  for (const b of rangeSlice) {
    if (b.h != null) m5RangeHigh = m5RangeHigh == null ? b.h : Math.max(m5RangeHigh, b.h);
    if (b.l != null) m5RangeLow = m5RangeLow == null ? b.l : Math.min(m5RangeLow, b.l);
  }

  const atr = formingM5?.atr ?? closedM5?.atr ?? bars5[bars5.length - 1]?.atr ?? null;
  const zoneUsd =
    atr != null && Number.isFinite(atr) ? zoneAtrMult * atr : numEnv("XAU_LEVELS_ZONE_USD_FALLBACK", 1.2);

  /** Drop swings broken by recent closes (last 3 prior archived M5). */
  const recent = historyBars5.slice(-3);
  function filterBrokenSwings(swings, side) {
    return swings.filter((sw) => {
      if (side === "high") {
        return !recent.some((b) => b.c != null && b.c > sw.price + zoneUsd * 0.5);
      }
      return !recent.some((b) => b.c != null && b.c < sw.price - zoneUsd * 0.5);
    });
  }
  const activeSwingHighs = filterBrokenSwings(swingHighs, "high");
  const activeSwingLows = filterBrokenSwings(swingLows, "low");

  const resistanceCandidates = [
    m15Bar?.h,
    ...activeSwingHighs.map((s) => s.price),
    m5RangeHigh,
    ...manual.resistances,
    ...auto.resistances,
  ].filter((x) => x != null && Number.isFinite(x));

  const supportCandidates = [
    m15Bar?.l,
    ...activeSwingLows.map((s) => s.price),
    m5RangeLow,
    ...manual.supports,
    ...auto.supports,
  ].filter((x) => x != null && Number.isFinite(x));

  let mid = null;
  if (formingM5?.bid != null && formingM5?.ask != null) {
    mid = (formingM5.bid + formingM5.ask) / 2;
  } else if (formingM5?.c != null) {
    mid = formingM5.c;
  }

  const nearestResistance = mid != null ? nearestAbove(mid, resistanceCandidates) : null;
  const nearestSupport = mid != null ? nearestBelow(mid, supportCandidates) : null;

  const distResistanceUsd =
    mid != null && nearestResistance != null ? nearestResistance - mid : null;
  const distSupportUsd =
    mid != null && nearestSupport != null ? mid - nearestSupport : null;

  const inResistanceZone =
    distResistanceUsd != null && distResistanceUsd >= 0 && distResistanceUsd <= zoneUsd;
  const inSupportZone =
    distSupportUsd != null && distSupportUsd >= 0 && distSupportUsd <= zoneUsd;

  const m15BiasFromArchived = m15BiasFromBar(m15Bar);
  const m15Bias =
    m15BiasFromArchived !== "unknown" ? m15BiasFromArchived : m15BiasFromBar(formingM15);

  let closedSignal = null;
  const bar = closedM5;
  if (bar) {
    const loc = closeLocationRatio(bar);
    const nearRes =
      nearestResistance != null &&
      bar.h != null &&
      bar.h >= nearestResistance - zoneUsd;
    const nearSup =
      nearestSupport != null && bar.l != null && bar.l <= nearestSupport + zoneUsd;
    closedSignal = {
      rejectionAtResistance:
        nearRes && (bar.c < bar.o || (loc != null && loc <= 0.35)),
      bounceAtSupport:
        nearSup && (bar.c > bar.o || (loc != null && loc >= 0.65)),
    };
  }

  const watch = inSupportZone || inResistanceZone;

  /** Strong bullish momentum / trend on M5 — do not blindly fade resistance mid-bar. */
  const m5BullImpulse =
    (formingM5?.rsi != null && formingM5.rsi >= 65) ||
    (formingM5?.adx != null &&
      formingM5.adx >= 20 &&
      formingM5?.ema20 != null &&
      formingM5?.ema50 != null &&
      formingM5.ema20 > formingM5.ema50 &&
      mid != null &&
      mid > formingM5.ema20);

  /** True when price has broken above recent M5 range high or manual/swing resistances, or is in a strong M5 bull impulse without closed-bar rejection. */
  const maxResistanceCandidate =
    resistanceCandidates.length > 0 ? Math.max(...resistanceCandidates) : null;
  const breakoutAboveResistance =
    (mid != null &&
      ((m5RangeHigh != null && mid > m5RangeHigh + Math.min(zoneUsd * 0.25, 0.8)) ||
        (maxResistanceCandidate != null && mid > maxResistanceCandidate))) ||
    (m5BullImpulse && closedSignal?.rejectionAtResistance !== true);

  const consider = {
    /** Favor watching long at support (bull M15 or Pine sweep bull). */
    longAtSupport:
      (m15Bias === "bull" && inSupportZone) ||
      (inSupportZone && agentFeed?.sweepBull === true),
    /** Short fade when in zone, not breaking out; need closed-bar rejection or sweep (not mid-only). */
    shortAtResistance:
      inResistanceZone &&
      !breakoutAboveResistance &&
      (closedSignal?.rejectionAtResistance === true || agentFeed?.sweepBear === true),
    m15Bias,
  };

  return {
    ok: bars5.length > 0 || m15Bar != null,
    mid,
    atr,
    zoneUsd,
    zoneAtrMult,
    nearestResistance,
    nearestSupport,
    distResistanceUsd,
    distSupportUsd,
    inResistanceZone,
    inSupportZone,
    breakoutAboveResistance,
    watch,
    consider,
    sources: {
      m15LastHigh: m15Bar?.h ?? null,
      m15LastLow: m15Bar?.l ?? null,
      m15LastClose: m15Bar?.c ?? null,
      m5RangeHigh,
      m5RangeLow,
      swingHighCount: swingHighs.length,
      swingLowCount: swingLows.length,
      manualSupportCount: manual.supports.length,
      manualResistanceCount: manual.resistances.length,
      autoSupportCount: auto.supports.length,
      autoResistanceCount: auto.resistances.length,
      agentFeedOk: agentFeed?.ok === true,
      agentFeed,
    },
    swings: {
      highs: swingHighs.slice(-3),
      lows: swingLows.slice(-3),
    },
    closedBar: closedSignal,
  };
}
