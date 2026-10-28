import fs from "node:fs";
import { getContextPath, getStateDir } from "./xau-store-paths.js";

export function getPendingSignalPath() {
  return `${getStateDir()}/pending-signal.json`;
}

export function getProcessedSignalsPath() {
  return `${getStateDir()}/processed-signals.json`;
}

export function getEvaluationsPath() {
  return `${getStateDir()}/evaluations.jsonl`;
}

function numEnv(name, fallback) {
  const v = process.env[name];
  if (v == null || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** Thresholds echoed in context.json for the agent (override via env). */
export function getDecisionLimits() {
  return {
    spreadMaxPoints: numEnv("XAU_SPREAD_MAX_POINTS", 80),
    /** Max seconds from poll time treating closed bar as fresh (90s loop + slack). */
    signalMaxAgeSec: numEnv("XAU_SIGNAL_MAX_AGE_SEC", 120),
    /** Max |mid − signal close| in $ before stale entry. */
    maxSlippageUsd: numEnv("XAU_MAX_SLIPPAGE_USD", 2.5),
    /** Reject if structural stop distance > this × M5 ATR (when ATR parsed). */
    maxStopAtrMult: numEnv("XAU_MAX_STOP_ATR_MULT", 1.2),
    minNetRR: numEnv("XAU_MIN_NET_RR", 1.5),
    minAlignmentScore: numEnv("XAU_MIN_ALIGNMENT_SCORE", 4),
    m15m5CloseMaxDeltaUsd: numEnv("XAU_M15_M5_CLOSE_MAX_DELTA_USD", 3),
    adxMinWhenPresent: numEnv("XAU_ADX_MIN", 20),
  };
}

export function readProcessedSignals() {
  const p = getProcessedSignalsPath();
  if (!fs.existsSync(p)) return { lastSignalId: null, lastDecision: null, lastAt: null };
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return { lastSignalId: null, lastDecision: null, lastAt: null };
  }
}

export function writePendingSignal(payload) {
  fs.writeFileSync(getPendingSignalPath(), JSON.stringify(payload, null, 2), "utf8");
}

export function clearPendingSignal() {
  const p = getPendingSignalPath();
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

/** @param {object} bar closed 5m bar row from bars-5m.jsonl */
export function buildSignalId(bar) {
  if (!bar) return null;
  return `5m:${bar.bucket ?? "?"}:${bar.barKey ?? bar.ts}`;
}

export function midPrice(m5) {
  if (!m5) return null;
  if (m5.bid != null && m5.ask != null) return (m5.bid + m5.ask) / 2;
  return m5.c ?? null;
}

/**
 * After a new 5m bar is archived, expose deterministic hints for the agent.
 */
export function writeSignalContext({ closedBar, pollTs, formingM5, limits, processed }) {
  const signalId = buildSignalId(closedBar);
  const alreadyProcessed = processed?.lastSignalId === signalId;
  const mid = midPrice(formingM5);
  const slipUsd =
    closedBar?.c != null && mid != null ? Math.abs(mid - closedBar.c) : null;
  const pollMs = pollTs ? Date.parse(pollTs) : Date.now();
  const barMs = closedBar?.ts ? Date.parse(closedBar.ts) : pollMs;
  const ageSec = Math.max(0, Math.round((pollMs - barMs) / 1000));

  const pending = {
    signalId,
    alreadyProcessed,
    closedBarTs: closedBar?.ts ?? null,
    pollTs,
    ageSec,
    slipUsd,
    signalClose: closedBar?.c ?? null,
    executableMid: mid,
    staleByAge: ageSec > limits.signalMaxAgeSec,
    staleBySlip: slipUsd != null && slipUsd > limits.maxSlippageUsd,
    limits,
  };

  writePendingSignal(pending);
  return pending;
}

export function appendEvaluation(record) {
  const line = JSON.stringify({ ts: new Date().toISOString(), ...record }) + "\n";
  fs.appendFileSync(getEvaluationsPath(), line, "utf8");
  if (record.signalId) {
    fs.writeFileSync(
      getProcessedSignalsPath(),
      JSON.stringify(
        {
          lastSignalId: record.signalId,
          lastDecision: record.decision ?? null,
          lastAt: new Date().toISOString(),
        },
        null,
        2,
      ),
      "utf8",
    );
  }
}
