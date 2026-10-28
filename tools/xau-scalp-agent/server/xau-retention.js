/**
 * Retention policy for XAU state files.
 *
 * What we trim vs keep:
 * - ticks.jsonl     — slim poll lines (intra-bar drift); trim tail only
 * - bars-5m.jsonl   — closed 5m bars on bucket roll; trim tail only
 * - bars-15m.jsonl  — closed 15m bars on bucket roll; trim tail only
 * - decisions.jsonl — ENTER / setup journal; trim only if max > 0
 * - latest.json, context.json, status — never trimmed (single snapshot)
 */
import fs from "node:fs";
import {
  getBars15mPath,
  getBars5mPath,
  getDecisionsPath,
  getTicksPath,
  slimTf,
} from "./xau-store-paths.js";

function numEnv(name, fallback) {
  const v = process.env[name];
  if (v == null || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** @typedef {{ ticksMaxLines: number, bars5mMaxLines: number, bars15mMaxLines: number, decisionsMaxLines: number }} RetentionConfig */

export function getRetentionConfig() {
  return {
    /** Slim polls @ 90s: 500 ≈ 12.5h session narrative */
    ticksMaxLines: numEnv("XAU_TICKS_MAX_LINES", 500),
    /** Closed 5m bars: 96 = 8 hours */
    bars5mMaxLines: numEnv("XAU_BARS_5M_MAX_LINES", 96),
    /** Closed 15m bars: 32 = 8 hours */
    bars15mMaxLines: numEnv("XAU_BARS_15M_MAX_LINES", 32),
    /** 0 = never trim decisions; else keep last N lines */
    decisionsMaxLines: numEnv("XAU_DECISIONS_MAX_LINES", 0),
  };
}

export function trimJsonlTail(filePath, maxLines) {
  if (!maxLines || maxLines < 1 || !filePath) return;
  if (!fs.existsSync(filePath)) return;

  const raw = fs.readFileSync(filePath, "utf8");
  const lines = raw.split("\n").filter(Boolean);
  if (lines.length <= maxLines) return;

  const tail = lines.slice(-maxLines).join("\n") + "\n";
  fs.writeFileSync(filePath, tail, "utf8");
}

function appendJsonl(filePath, record) {
  fs.appendFileSync(filePath, JSON.stringify(record) + "\n", "utf8");
}

/** Full closed-bar snapshot (decision-grade structure, not every poll). */
export function barCloseRecord(kind, tf, bucket, ts) {
  if (!tf) return null;
  return {
    ts,
    kind,
    bucket: bucket ?? null,
    barKey: tf.barKey ?? null,
    o: tf.o ?? null,
    h: tf.h ?? null,
    l: tf.l ?? null,
    c: tf.c ?? null,
    bid: tf.bid ?? null,
    ask: tf.ask ?? null,
    spread: tf.spread ?? null,
    rsi: tf.rsi ?? null,
    rsiPrev: tf.rsiPrev ?? null,
    adx: tf.adx ?? null,
    atr: tf.atr ?? null,
    vwap: tf.vwap ?? null,
    ema20: tf.ema20 ?? null,
    ema50: tf.ema50 ?? null,
  };
}

/**
 * @param {RetentionConfig} cfg
 */
export function appendSlimTick(record, cfg = getRetentionConfig()) {
  appendJsonl(getTicksPath(), record);
  trimJsonlTail(getTicksPath(), cfg.ticksMaxLines);
}

/**
 * Call when isNew5mBar / isNew15mBar — archives the **previous** bar from `prev` snapshot.
 * @param {'5m'|'15m'} kind
 */
export function appendBarClose(kind, tf, bucket, ts, cfg = getRetentionConfig()) {
  const row = barCloseRecord(kind, tf, bucket, ts);
  if (!row) return;

  if (kind === "5m") {
    appendJsonl(getBars5mPath(), row);
    trimJsonlTail(getBars5mPath(), cfg.bars5mMaxLines);
    return;
  }
  if (kind === "15m") {
    appendJsonl(getBars15mPath(), row);
    trimJsonlTail(getBars15mPath(), cfg.bars15mMaxLines);
  }
}

export function appendDecisionRecord(record, cfg = getRetentionConfig()) {
  appendJsonl(getDecisionsPath(), { ts: new Date().toISOString(), ...record });
  if (cfg.decisionsMaxLines > 0) {
    trimJsonlTail(getDecisionsPath(), cfg.decisionsMaxLines);
  }
}

/** Build slim tick line for JSONL (not bar archive). */
export function buildSlimTickRecord({
  ts,
  isNew5mBar,
  isNew15mBar,
  bucket5m,
  bucket15m,
  m15,
  m5,
  ms,
}) {
  return {
    ts,
    isNew5mBar,
    isNew15mBar,
    bucket5m,
    bucket15m,
    m15: slimTf(m15),
    m5: slimTf(m5),
    ms,
  };
}

export function applyRetentionTrimAll(cfg = getRetentionConfig()) {
  trimJsonlTail(getTicksPath(), cfg.ticksMaxLines);
  trimJsonlTail(getBars5mPath(), cfg.bars5mMaxLines);
  trimJsonlTail(getBars15mPath(), cfg.bars15mMaxLines);
  if (cfg.decisionsMaxLines > 0) {
    trimJsonlTail(getDecisionsPath(), cfg.decisionsMaxLines);
  }
}
