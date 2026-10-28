import fs from "node:fs";
import path from "node:path";

const DEFAULT_DIR =
  process.env.XAU_SCALP_STATE_DIR ||
  path.join(process.env.HOME || "/tmp", ".local/state/xau-scalp-agent");

export function getStateDir() {
  fs.mkdirSync(DEFAULT_DIR, { recursive: true });
  return DEFAULT_DIR;
}

export function getTicksPath() {
  return path.join(getStateDir(), "ticks.jsonl");
}

export function getBars5mPath() {
  return path.join(getStateDir(), "bars-5m.jsonl");
}

export function getBars15mPath() {
  return path.join(getStateDir(), "bars-15m.jsonl");
}

export function getLatestPath() {
  return path.join(getStateDir(), "latest.json");
}

export function getContextPath() {
  return path.join(getStateDir(), "context.json");
}

export function getDecisionsPath() {
  return path.join(getStateDir(), "decisions.jsonl");
}

export function getSignalsPath() {
  return path.join(getStateDir(), "signals.jsonl");
}

export function getSignalJournalPath() {
  return path.join(getStateDir(), "signal-journal.md");
}

export function getStatusPath() {
  return process.env.XAU_AGENT_STATUS_PATH || "/tmp/xau-agent-status.json";
}

/** Compact line for JSONL (full OHLC lives in latest.json + bars-*.jsonl). */
export function slimTf(tf) {
  if (!tf) return null;
  return {
    c: tf.c ?? null,
    rsi: tf.rsi ?? null,
    adx: tf.adx ?? null,
    spread: tf.spread ?? null,
    barKey: tf.barKey ?? null,
  };
}
