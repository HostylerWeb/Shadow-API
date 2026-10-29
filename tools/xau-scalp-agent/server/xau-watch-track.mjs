/**
 * Full trade-idea lifecycle tracker:
 * 1. ENTRY_OPEN ("Get ready"): Price is in the entry zone; user can enter.
 * 2. HOLD_FAVORABLE ("Hold if in / don't chase if out"): Price moved in favor out of the entry zone.
 *    We KEEP tracking the trade so the user gets alerted on Target 1, Stop, or Reversal!
 * 3. REVERSAL_WARNING ("Warning — price turning against your trade"): Opposite setup, rejection/sweep,
 *    or momentum + M15 trend turning against an open trade.
 * 4. TP1_HIT / STOP_BROKEN: Final completion of the tracked idea.
 */
import fs from "node:fs";
import path from "node:path";
import { getStateDir } from "./xau-store-paths.js";
import { appendSignalEvent } from "./xau-signal-log.mjs";
import { formatWatchCancelledChat } from "./xau-user-messages.mjs";

function numEnv(name, fallback) {
  const v = process.env[name];
  if (v == null || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function round2(n) {
  if (n == null || !Number.isFinite(Number(n))) return null;
  return Math.round(Number(n) * 100) / 100;
}

function getActiveWatchPath() {
  return path.join(getStateDir(), "active-watch.json");
}

function getCooldownPath() {
  return path.join(getStateDir(), "watch-cooldown.json");
}

function readActiveWatch() {
  const p = getActiveWatchPath();
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

function readCooldownUntilMs() {
  const p = getCooldownPath();
  if (!fs.existsSync(p)) return 0;
  try {
    const j = JSON.parse(fs.readFileSync(p, "utf8"));
    const t = Date.parse(j.until ?? "");
    return Number.isFinite(t) ? t : 0;
  } catch {
    return 0;
  }
}

function setCooldownFromNow(ts, secOverride = null) {
  const sec = secOverride ?? numEnv("XAU_WATCH_COOLDOWN_SEC", 180);
  const untilMs = new Date(ts).getTime() + sec * 1000;
  fs.mkdirSync(getStateDir(), { recursive: true });
  fs.writeFileSync(
    getCooldownPath(),
    JSON.stringify({ until: new Date(untilMs).toISOString(), sec }, null, 2),
    "utf8",
  );
  return untilMs;
}

function writeActiveWatch(obj) {
  fs.mkdirSync(getStateDir(), { recursive: true });
  fs.writeFileSync(getActiveWatchPath(), JSON.stringify(obj, null, 2), "utf8");
}

function clearActiveWatch() {
  const p = getActiveWatchPath();
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

function planFingerprint(tradePlan) {
  if (!tradePlan?.actionableWatch || !tradePlan?.primary?.ok) return null;
  const p = tradePlan.primary;
  return {
    direction: p.direction,
    entryLow: p.entryLow,
    entryHigh: p.entryHigh,
    stop: p.stop,
    tp1: p.tp1,
    tp2: p.tp2 ?? null,
  };
}

function fpEqual(a, b) {
  if (!a || !b) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

function inSrZoneForWatch(levels) {
  return levels?.watch === true;
}

function formatDoNotEnter(prev) {
  return formatWatchCancelledChat({
    direction: prev.direction,
    entryLow: prev.entryLow,
    entryHigh: prev.entryHigh,
    stop: prev.stop,
    tp1: prev.tp1,
    tp2: prev.tp2,
    mid: prev.mid,
    eventType: prev.eventType,
    adverseDetail: prev.adverseDetail,
    revokeReasons: prev.revokeReasons,
  });
}

/**
 * Check if price / momentum / structure is turning against an active trade idea.
 * Returns { isReversing: boolean, detail: string|null }
 */
function detectAdverseReversal({ prev, mid, bestMid, levels, formingM5, isNew5mBar }) {
  if (mid == null || !prev) return { isReversing: false, detail: null };
  const dir = prev.direction;
  const lo = Number(prev.entryLow);
  const hi = Number(prev.entryHigh);
  const m15Bias = levels?.consider?.m15Bias;
  const rsi = formingM5?.rsi;
  const m5BearCandle =
    formingM5?.c != null && formingM5?.o != null && formingM5.c < formingM5.o - 0.35;
  const m5BullCandle =
    formingM5?.c != null && formingM5?.o != null && formingM5.c > formingM5.o + 0.35;

  if (dir === "long") {
    if (levels?.closedBar?.rejectionAtResistance && mid > hi) {
      return {
        isReversing: true,
        detail: "5m printed a rejection candle at resistance against your Buy",
      };
    }
    if (levels?.sources?.agentFeed?.sweepBear) {
      return {
        isReversing: true,
        detail: "Bearish liquidity sweep detected against your Buy",
      };
    }
    if (levels?.consider?.shortAtResistance) {
      return {
        isReversing: true,
        detail: "Opposite Sell setup triggered at resistance",
      };
    }
    const peak = bestMid != null ? Math.max(bestMid, mid) : mid;
    const profitRun = peak - hi;
    const pullbackFromPeak = peak - mid;
    /** Ran at least +$1.8 above entry zone, then gave back >= $1.8 while M15 is bear or 5m momentum turns down. */
    if (
      profitRun >= 1.8 &&
      pullbackFromPeak >= 1.8 &&
      (m15Bias === "bear" || (m5BearCandle && rsi != null && rsi < 44))
    ) {
      return {
        isReversing: true,
        detail: `Pulled back from $${round2(peak)} to $${round2(mid)} with ${m15Bias === "bear" ? "15m trend down" : "weakening 5m momentum"}`,
      };
    }
    /** Dropped below entry zone toward stop on a closed 5m bar or strong red candle. */
    if (mid < lo - 0.35 && (isNew5mBar || (m5BearCandle && rsi != null && rsi < 42))) {
      return {
        isReversing: true,
        detail: `Price broke below entry zone ($${lo}) to $${round2(mid)} toward stop ($${prev.stop})`,
      };
    }
  }

  if (dir === "short") {
    if (levels?.closedBar?.bounceAtSupport && mid < lo) {
      return {
        isReversing: true,
        detail: "5m printed a bounce candle at support against your Sell",
      };
    }
    if (levels?.sources?.agentFeed?.sweepBull) {
      return {
        isReversing: true,
        detail: "Bullish liquidity sweep detected against your Sell",
      };
    }
    if (levels?.consider?.longAtSupport) {
      return {
        isReversing: true,
        detail: "Opposite Buy setup triggered at support",
      };
    }
    if (levels?.breakoutAboveResistance && mid > hi + 0.3) {
      return {
        isReversing: true,
        detail: `Bullish breakout above resistance ($${hi}) against your Sell`,
      };
    }
    const trough = bestMid != null ? Math.min(bestMid, mid) : mid;
    const profitRun = lo - trough;
    const bounceFromLow = mid - trough;
    if (
      profitRun >= 1.8 &&
      bounceFromLow >= 1.8 &&
      (m15Bias === "bull" || (m5BullCandle && rsi != null && rsi > 56))
    ) {
      return {
        isReversing: true,
        detail: `Bounced from $${round2(trough)} to $${round2(mid)} with ${m15Bias === "bull" ? "15m trend up" : "rising 5m momentum"}`,
      };
    }
    if (mid > hi + 0.35 && (isNew5mBar || (m5BullCandle && rsi != null && rsi > 58))) {
      return {
        isReversing: true,
        detail: `Price pushed above entry zone ($${hi}) to $${round2(mid)} toward stop ($${prev.stop})`,
      };
    }
  }

  return { isReversing: false, detail: null };
}

function issueWatch({ tradePlan, levels, bucket5m, ts, market, fp, inZone }) {
  const mid = market?.mid ?? levels?.mid ?? null;
  const row = {
    active: true,
    phase: "ENTRY_OPEN",
    issuedAt: ts,
    bucket5m,
    inZone,
    direction: fp.direction,
    entryLow: fp.entryLow,
    entryHigh: fp.entryHigh,
    stop: fp.stop,
    tp1: fp.tp1,
    tp2: fp.tp2,
    bestMid: mid,
    holdNotified: false,
    reversalWarned: false,
    fingerprint: fp,
    chatDraft: tradePlan.chatDraft ?? null,
  };
  writeActiveWatch(row);
  const primary = tradePlan.primary;
  appendSignalEvent({
    type: "watch",
    ts,
    direction: fp.direction,
    entryLow: fp.entryLow,
    entryHigh: fp.entryHigh,
    stop: fp.stop,
    tp1: fp.tp1,
    tp2: fp.tp2 ?? null,
    netRRtp1: primary?.netRRtp1 ?? null,
    mid,
    spread: market?.spread ?? null,
    m5Close: market?.m5Close ?? null,
    inResistanceZone: levels?.inResistanceZone ?? false,
    inSupportZone: levels?.inSupportZone ?? false,
    chatDraft: tradePlan.chatDraft ?? null,
  });
}

function buildUpdateEvent({ prev, ts, mid, market, eventType, reasons, adverseDetail = null }) {
  const payload = {
    notify: true,
    eventType,
    revokedAt: ts,
    reasons,
    adverseDetail,
    mid,
    previous: {
      direction: prev.direction,
      entryLow: prev.entryLow,
      entryHigh: prev.entryHigh,
      stop: prev.stop,
      tp1: prev.tp1,
      tp2: prev.tp2 ?? null,
      issuedAt: prev.issuedAt,
    },
  };
  payload.chatDoNotEnter = formatDoNotEnter({
    ...prev,
    mid,
    eventType,
    adverseDetail,
    revokeReasons: reasons,
  });
  appendSignalEvent({
    type: "revoke",
    eventType,
    ts,
    direction: prev.direction,
    entryLow: prev.entryLow,
    entryHigh: prev.entryHigh,
    stop: prev.stop,
    tp1: prev.tp1,
    tp2: prev.tp2 ?? null,
    reasons,
    adverseDetail,
    mid,
    spread: market?.spread ?? null,
    chatDoNotEnter: payload.chatDoNotEnter,
  });
  return payload;
}

/**
 * @param {{ tradePlan: object, levels: object, isNew5mBar: boolean, bucket5m: number, ts: string, market?: object, dataIntegrity?: object, formingM5?: object }} input
 * @returns {{ watchRevoked: object|null, activeWatch: object|null, watchSuppressed: object|null, newWatchIssued: boolean }}
 */
export function updateWatchTracking({
  tradePlan,
  levels,
  isNew5mBar,
  bucket5m,
  ts,
  market = null,
  dataIntegrity = null,
  formingM5 = null,
}) {
  const prev = readActiveWatch();
  let watchRevoked = null;
  let watchSuppressed = null;
  let newWatchIssued = false;

  const fp = planFingerprint(tradePlan);
  const inZone = inSrZoneForWatch(levels);
  const dataOk = dataIntegrity?.ok === true && dataIntegrity?.m5ArchiveOk !== false;
  const cooldownUntilMs = readCooldownUntilMs();
  const nowMs = new Date(ts).getTime();
  const inCooldown = cooldownUntilMs > nowMs;
  const mid = market?.mid ?? levels?.mid ?? null;

  if (prev?.active && dataOk && mid != null) {
    const dir = prev.direction;
    const lo = Number(prev.entryLow);
    const hi = Number(prev.entryHigh);
    const stop = Number(prev.stop);
    const tp1 = Number(prev.tp1);

    const bestMid =
      prev.bestMid == null
        ? mid
        : dir === "long"
          ? Math.max(prev.bestMid, mid)
          : Math.min(prev.bestMid, mid);

    const issuedMs = Date.parse(prev.issuedAt ?? "");
    const ageMin = Number.isFinite(issuedMs) ? (nowMs - issuedMs) / 60000 : 0;
    const maxTrackMin = numEnv("XAU_MAX_TRACK_MINUTES", 45);

    /** 1. Check Target 1 hit */
    const tp1Hit =
      Number.isFinite(tp1) && ((dir === "long" && mid >= tp1) || (dir === "short" && mid <= tp1));

    /** 2. Check Stop hit */
    const stopHit =
      Number.isFinite(stop) && ((dir === "long" && mid <= stop) || (dir === "short" && mid >= stop));

    /** 3. Check Adverse / Reversal against trade */
    const reversal = detectAdverseReversal({
      prev,
      mid,
      bestMid,
      levels,
      formingM5,
      isNew5mBar,
    });

    /** 4. Check if price moved into profit outside the entry zone ("Hold if in, don't chase if out") */
    const holdBufferUsd = numEnv("XAU_HOLD_FAVORABLE_BUFFER_USD", 0.75);
    const movedFavorable =
      (dir === "long" && mid > hi + holdBufferUsd) ||
      (dir === "short" && mid < lo - holdBufferUsd);

    if (tp1Hit) {
      watchRevoked = buildUpdateEvent({
        prev,
        ts,
        mid,
        market,
        eventType: "tp1_hit",
        reasons: [`Target 1 ($${tp1}) reached`],
      });
      clearActiveWatch();
      setCooldownFromNow(ts, 120);
    } else if (stopHit) {
      watchRevoked = buildUpdateEvent({
        prev,
        ts,
        mid,
        market,
        eventType: "stop_broken",
        reasons: [`Stop loss ($${stop}) reached`],
      });
      clearActiveWatch();
      setCooldownFromNow(ts, 300);
    } else if (reversal.isReversing && !prev.reversalWarned) {
      watchRevoked = buildUpdateEvent({
        prev,
        ts,
        mid,
        market,
        eventType: "reversal_warning",
        reasons: [reversal.detail || "price turning against trade"],
        adverseDetail: reversal.detail,
      });
      /** Keep tracking for stop/TP1 or clear if it never left the entry zone */
      const everInProfit =
        (dir === "long" && bestMid > hi + holdBufferUsd) ||
        (dir === "short" && bestMid < lo - holdBufferUsd);
      if (everInProfit) {
        writeActiveWatch({
          ...prev,
          bestMid,
          phase: "REVERSAL_WARNED",
          reversalWarned: true,
          lastWarningDetail: reversal.detail,
        });
      } else {
        clearActiveWatch();
        setCooldownFromNow(ts, 240);
      }
    } else if (movedFavorable && !prev.holdNotified) {
      watchRevoked = buildUpdateEvent({
        prev,
        ts,
        mid,
        market,
        eventType: "hold_favorable",
        reasons: ["moved in favor above/below entry zone — hold if in, do not chase if out"],
      });
      writeActiveWatch({
        ...prev,
        bestMid,
        phase: "HOLD_FAVORABLE",
        holdNotified: true,
      });
    } else if (ageMin > maxTrackMin) {
      watchRevoked = buildUpdateEvent({
        prev,
        ts,
        mid,
        market,
        eventType: "expired",
        reasons: [`setup tracking expired after ${Math.round(ageMin)} min`],
      });
      clearActiveWatch();
    } else {
      /** Continue tracking silently; update bestMid */
      writeActiveWatch({
        ...prev,
        bestMid,
      });
    }
  }

  const currentAfterUpdate = readActiveWatch();
  const revokedThisTick = watchRevoked != null;

  if (tradePlan?.actionableWatch && fp && !revokedThisTick) {
    if (!dataOk) {
      watchSuppressed = {
        reason: "data_integrity",
        note: "No watch alerts while dataIntegrity.ok is false or M5 archive failed.",
      };
    } else if (inCooldown) {
      watchSuppressed = {
        reason: "cooldown",
        until: new Date(cooldownUntilMs).toISOString(),
        note: "No new watch alerts until cooldown ends.",
      };
    } else if (levels?.breakoutAboveResistance && fp.direction === "short") {
      watchSuppressed = {
        reason: "breakout",
        note: "Short watch suppressed — price above resistance (breakout).",
      };
    } else if (!currentAfterUpdate?.active) {
      issueWatch({ tradePlan, levels, bucket5m, ts, market, fp, inZone });
      newWatchIssued = true;
    } else {
      watchSuppressed = {
        reason: "already_active",
        issuedAt: currentAfterUpdate.issuedAt,
        note: "Trade idea already active — tracking hold/reversal/TP/stop.",
      };
    }
  }

  const activeWatch = readActiveWatch();
  return {
    watchRevoked,
    activeWatch: activeWatch?.active ? activeWatch : null,
    watchSuppressed,
    newWatchIssued,
  };
}

/** Strip chat-facing watch when suppressed so agent does not double-message. */
export function applyWatchSuppression(tradePlan, { watchRevoked, watchSuppressed }) {
  if (!tradePlan?.plansComputed) return tradePlan;
  if (watchRevoked?.notify) {
    return {
      ...tradePlan,
      actionableWatch: false,
      chatDraft: null,
      role: tradePlan.hasFreshSignal ? "signalBar" : "candidate",
      candidateOnly: !tradePlan.hasFreshSignal,
    };
  }
  if (watchSuppressed && tradePlan.actionableWatch) {
    return {
      ...tradePlan,
      actionableWatch: false,
      chatDraft: null,
      role: tradePlan.hasFreshSignal ? "signalBar" : "candidate",
      candidateOnly: !tradePlan.hasFreshSignal,
      watchSuppressed,
    };
  }
  return tradePlan;
}
