/**
 * Tracks issued actionableWatch plans and revokes when conditions change
 * (user did not enter — we assume no MT5 fill feedback in v0).
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

/** Wider band before "left zone" revoke — stops ~$1 mid noise from prepare/stand-down spam. */
function zoneExitHystUsd(levels) {
  const z = levels?.zoneUsd ?? 1.4;
  const env = numEnv("XAU_ZONE_EXIT_HYST_USD", NaN);
  if (Number.isFinite(env)) return env;
  return Math.max(0.55, z * 0.45);
}

function inSrZoneForWatch(levels) {
  return levels?.watch === true;
}

function leftSrZoneForWatch(levels, direction) {
  const z = levels?.zoneUsd ?? 1.4;
  const h = zoneExitHystUsd(levels);
  if (direction === "short") {
    const d = levels?.distResistanceUsd;
    return d == null || d < 0 || d > z + h;
  }
  if (direction === "long") {
    const d = levels?.distSupportUsd;
    return d == null || d < 0 || d > z + h;
  }
  return !inSrZoneForWatch(levels);
}

function formatDoNotEnter(prev) {
  return formatWatchCancelledChat({
    direction: prev.direction,
    entryLow: prev.entryLow,
    entryHigh: prev.entryHigh,
    tp1: prev.tp1,
  });
}

function issueWatch({ tradePlan, levels, bucket5m, ts, market, fp, inZone }) {
  const row = {
    active: true,
    issuedAt: ts,
    bucket5m,
    inZone,
    direction: fp.direction,
    entryLow: fp.entryLow,
    entryHigh: fp.entryHigh,
    stop: fp.stop,
    tp1: fp.tp1,
    tp2: fp.tp2,
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
    mid: market?.mid ?? levels?.mid ?? null,
    spread: market?.spread ?? null,
    m5Close: market?.m5Close ?? null,
    inResistanceZone: levels?.inResistanceZone ?? false,
    inSupportZone: levels?.inSupportZone ?? false,
    chatDraft: tradePlan.chatDraft ?? null,
  });
}

/**
 * @param {{ tradePlan: object, levels: object, isNew5mBar: boolean, bucket5m: number, ts: string, market?: object, dataIntegrity?: object }} input
 * @returns {{ watchRevoked: object|null, activeWatch: object|null, watchSuppressed: object|null }}
 */
export function updateWatchTracking({
  tradePlan,
  levels,
  isNew5mBar,
  bucket5m,
  ts,
  market = null,
  dataIntegrity = null,
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

  if (prev?.active) {
    const reasons = [];

    if (isNew5mBar && prev.bucket5m != null && bucket5m !== prev.bucket5m) {
      reasons.push("new 5m bar closed");
    }
    if (!tradePlan?.actionableWatch) {
      reasons.push("watch no longer actionable");
    } else if (fp && prev.direction && fp.direction !== prev.direction) {
      reasons.push(`direction flipped (${prev.direction} -> ${fp.direction})`);
    }
    const leftZone = leftSrZoneForWatch(levels, prev.direction);
    if (prev.inZone && leftZone) {
      reasons.push("price left the S/R zone");
    }

    if (reasons.length > 0) {
      watchRevoked = {
        notify: true,
        revokedAt: ts,
        reasons,
        previous: {
          direction: prev.direction,
          entryLow: prev.entryLow,
          entryHigh: prev.entryHigh,
          stop: prev.stop,
          tp1: prev.tp1,
          tp2: prev.tp2 ?? null,
          issuedAt: prev.issuedAt,
        },
        chatDoNotEnter: formatDoNotEnter({
          ...prev,
          revokeReasons: reasons,
        }),
      };
      appendSignalEvent({
        type: "revoke",
        ts,
        direction: prev.direction,
        entryLow: prev.entryLow,
        entryHigh: prev.entryHigh,
        stop: prev.stop,
        tp1: prev.tp1,
        tp2: prev.tp2 ?? null,
        reasons,
        mid: market?.mid ?? levels?.mid ?? null,
        spread: market?.spread ?? null,
        chatDoNotEnter: watchRevoked.chatDoNotEnter,
      });
      clearActiveWatch();
      const issuedMs = Date.parse(prev.issuedAt ?? "");
      const livedSec =
        Number.isFinite(issuedMs) ? (nowMs - issuedMs) / 1000 : 999;
      const flopSec = numEnv("XAU_WATCH_FLOP_SEC", 120);
      const flopCooldownSec = numEnv("XAU_WATCH_FLOP_COOLDOWN_SEC", 600);
      if (livedSec < flopSec && reasons.some((r) => r.includes("zone"))) {
        setCooldownFromNow(ts, flopCooldownSec);
      } else {
        setCooldownFromNow(ts);
      }
    } else if (
      tradePlan?.actionableWatch &&
      fp &&
      prev.fingerprint &&
      !fpEqual(fp, prev.fingerprint)
    ) {
      /** Price band moved — update stored plan silently (no cancel + re-alert spam). */
      writeActiveWatch({
        ...prev,
        issuedAt: prev.issuedAt,
        entryLow: fp.entryLow,
        entryHigh: fp.entryHigh,
        stop: fp.stop,
        tp1: fp.tp1,
        tp2: fp.tp2,
        fingerprint: fp,
        chatDraft: tradePlan.chatDraft ?? null,
      });
    }
  }

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
        note: "No new watch alerts until cooldown ends (after last stand-down).",
      };
    } else if (levels?.breakoutAboveResistance && fp.direction === "short") {
      watchSuppressed = {
        reason: "breakout",
        note: "Short watch suppressed — price above resistance (breakout).",
      };
    } else {
      const current = readActiveWatch();
      const sameAsActive =
        current?.active &&
        fpEqual(fp, current.fingerprint) &&
        current.inZone === inZone &&
        current.bucket5m === bucket5m;
      if (!sameAsActive && !current?.active) {
        issueWatch({ tradePlan, levels, bucket5m, ts, market, fp, inZone });
        newWatchIssued = true;
      } else if (current?.active && !newWatchIssued) {
        watchSuppressed = {
          reason: "already_active",
          issuedAt: current.issuedAt,
          note: "Same watch already active on this 5m bar — do not re-paste draft every 60s.",
        };
      }
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
