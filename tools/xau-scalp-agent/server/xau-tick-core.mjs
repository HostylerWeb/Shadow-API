/**
 * Shared one-poll logic: bridge snapshots → state files.
 */
import { requestExtension } from "../../chrome-agent-bridge/server/bridge.js";
import { parseTradingViewSnapshot } from "./parse-snapshot.js";
import {
  appendBarClose,
  appendTick,
  detectBarChange,
  getBars15mPath,
  getBars5mPath,
  getContextPath,
  getDecisionsPath,
  getLatestPath,
  getRetentionConfig,
  getStateDir,
  getStatusPath,
  getTicksPath,
  readLatest,
  writeContext,
  writeLatest,
  writeStatus,
} from "./xau-store.js";
import { buildSlimTickRecord } from "./xau-retention.js";
import fs from "node:fs";
import {
  getDecisionLimits,
  getEvaluationsPath,
  getPendingSignalPath,
  getProcessedSignalsPath,
  readProcessedSignals,
  writeSignalContext,
} from "./xau-signal.js";
import { getNewsCalendarPath, readNewsCalendar } from "./xau-forex-calendar.mjs";
import { computeLevelsContext } from "./xau-levels.mjs";
import { buildTradePlans } from "./xau-trade-plan.mjs";
import { assessDataIntegrity } from "./xau-data-integrity.mjs";
import { updateWatchTracking, applyWatchSuppression } from "./xau-watch-track.mjs";
import { writeAutoLevelsFromFeed, enrichAgentFeed } from "./xau-agent-feed.mjs";

function readLastJsonlLine(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const lines = fs.readFileSync(filePath, "utf8").split("\n").filter(Boolean);
  if (!lines.length) return null;
  try {
    return JSON.parse(lines[lines.length - 1]);
  } catch {
    return null;
  }
}

async function snapshotTradingTabs() {
  const tabs = await requestExtension("tabs.list");
  const tv = tabs.filter((t) => /tradingview\.com/i.test(t.url || ""));
  const byTf = {};

  for (const t of tv) {
    let snap = await requestExtension("page.command", {
      tabId: t.id,
      command: "tradingviewChart",
      args: {},
    });
    if (snap?.error || !(snap?.text || "").length) {
      snap = await requestExtension("page.command", {
        tabId: t.id,
        command: "snapshot",
        args: {},
      });
    }
    const text = snap?.text || snap?.data?.text || "";
    const parsed = parseTradingViewSnapshot(text);
    if (!parsed.tf) continue;
    byTf[parsed.tf] = {
      ...parsed,
      tabId: t.id,
      active: t.active,
      snapshotMode: snap?.mode ?? "snapshot",
    };
  }

  return byTf;
}

function bucket5mFromPrev(prev) {
  if (prev?.bucket5m != null) return prev.bucket5m;
  if (!prev?.ts) return null;
  return Math.floor(new Date(prev.ts).getTime() / (5 * 60 * 1000));
}

function bucket15mFromPrev(prev) {
  if (prev?.bucket15m != null) return prev.bucket15m;
  if (!prev?.ts) return null;
  return Math.floor(new Date(prev.ts).getTime() / (15 * 60 * 1000));
}

/**
 * @returns {Promise<{ ok: boolean, record?: object, summary?: object, error?: string }>}
 */
export async function runXauTick({ started = Date.now() } = {}) {
  const byTf = await snapshotTradingTabs();
  const prev = readLatest();
  const now = new Date();
  const nowIso = now.toISOString();
  const payload = {
    ts: nowIso,
    m15: byTf["15m"] ?? null,
    m5: byTf["5m"] ?? null,
  };

  if (!payload.m5 && !payload.m15) {
    throw new Error("No 5m/15m TradingView tabs found. Open XAUUSD 5m and 15m charts.");
  }

  if (payload.m5?.agentFeed?.ok) {
    writeAutoLevelsFromFeed(getStateDir(), payload.m5.agentFeed, nowIso);
  }

  const bars5ForFeed = fs.existsSync(getBars5mPath())
    ? fs
        .readFileSync(getBars5mPath(), "utf8")
        .split("\n")
        .filter(Boolean)
        .slice(-96)
        .map((line) => {
          try {
            return JSON.parse(line);
          } catch {
            return null;
          }
        })
        .filter(Boolean)
    : [];
  if (payload.m5) {
    payload.m5.agentFeed = enrichAgentFeed(payload.m5.agentFeed, {
      formingM5: payload.m5,
      bars5m: bars5ForFeed,
    });
    if (payload.m5.agentFeed?.ok) {
      writeAutoLevelsFromFeed(getStateDir(), payload.m5.agentFeed, nowIso);
    }
  }

  const { isNew5mBar, isNew15mBar, bucket5m, bucket15m } = detectBarChange(prev, payload, now);

  const dataIntegrity = assessDataIntegrity({
    m5: payload.m5,
    m15: payload.m15,
    prevM5: isNew5mBar ? prev?.m5 : null,
    newM5: payload.m5,
    isNew5mBar,
    prevM15: isNew15mBar ? prev?.m15 : null,
    newM15: payload.m15,
    isNew15mBar,
    prevTs: prev?.ts ?? null,
    nowTs: nowIso,
  });

  if (isNew5mBar && prev?.m5 && dataIntegrity.m5ArchiveOk) {
    appendBarClose("5m", prev.m5, prev.bucket5m ?? bucket5mFromPrev(prev), nowIso);
  }
  if (isNew15mBar && prev?.m15 && dataIntegrity.m15ArchiveOk) {
    appendBarClose("15m", prev.m15, prev.bucket15m ?? bucket15mFromPrev(prev), nowIso);
  }

  const record = buildSlimTickRecord({
    ts: nowIso,
    isNew5mBar,
    isNew15mBar,
    bucket5m,
    bucket15m,
    m15: payload.m15,
    m5: payload.m5,
    ms: Date.now() - started,
  });

  appendTick(record);
  writeLatest({ ...payload, bucket5m, bucket15m });

  const summary = {
    ok: true,
    ts: nowIso,
    isNew5mBar,
    isNew15mBar,
    m5: payload.m5
      ? { c: payload.m5.c, rsi: payload.m5.rsi, adx: payload.m5.adx, spread: payload.m5.spread }
      : null,
    m15: payload.m15 ? { c: payload.m15.c, adx: payload.m15.adx, spread: payload.m15.spread } : null,
  };

  const retention = getRetentionConfig();
  const limits = getDecisionLimits();
  const processed = readProcessedSignals();

  let signal = null;
  if (isNew5mBar && dataIntegrity.m5ArchiveOk) {
    const closedBar = readLastJsonlLine(getBars5mPath());
    if (closedBar) {
      signal = writeSignalContext({
        closedBar,
        pollTs: nowIso,
        formingM5: payload.m5,
        limits,
        processed,
      });
    }
  }

  const news = readNewsCalendar();

  const lastArchivedM5 = readLastJsonlLine(getBars5mPath());
  const lastArchivedAgeMin =
    lastArchivedM5?.ts ? (Date.parse(nowIso) - Date.parse(lastArchivedM5.ts)) / 60000 : 999;
  /** Keep the most recent closed 5m candle active for structure/triggers throughout the current 5m bar. */
  const closedM5ForLevels =
    lastArchivedM5 && lastArchivedAgeMin <= 10 ? lastArchivedM5 : null;
  const levels = computeLevelsContext({
    bars5mPath: getBars5mPath(),
    bars15mPath: getBars15mPath(),
    stateDir: getStateDir(),
    formingM5: payload.m5,
    formingM15: payload.m15,
    closedM5: closedM5ForLevels,
  });

  const tradePlan = buildTradePlans({
    closedBar: closedM5ForLevels ?? lastArchivedM5,
    formingM5: payload.m5,
    levels,
    limits,
    signal,
    isNew5mBar: isNew5mBar && dataIntegrity.m5ArchiveOk,
  });

  const { watchRevoked, activeWatch, watchSuppressed, newWatchIssued } = updateWatchTracking({
    tradePlan,
    levels,
    isNew5mBar,
    bucket5m,
    ts: nowIso,
    dataIntegrity,
    formingM5: payload.m5,
    market: {
      mid: levels?.mid ?? null,
      spread: payload.m5?.spread ?? null,
      m5Close: payload.m5?.c ?? null,
    },
  });

  const tradePlanOut = applyWatchSuppression(tradePlan, {
    watchRevoked,
    watchSuppressed,
    newWatchIssued,
  });

  writeContext({
    ...summary,
    dataIntegrity,
    paths: {
      latest: getLatestPath(),
      ticks: getTicksPath(),
      bars5m: getBars5mPath(),
      bars15m: getBars15mPath(),
      decisions: getDecisionsPath(),
      evaluations: getEvaluationsPath(),
      signals: `${getStateDir()}/signals.jsonl`,
      signalJournal: `${getStateDir()}/signal-journal.md`,
      pendingSignal: getPendingSignalPath(),
      processedSignals: getProcessedSignalsPath(),
      newsCalendar: getNewsCalendarPath(),
      context: getContextPath(),
      levelsManual: `${getStateDir()}/levels.json`,
      levelsAuto: `${getStateDir()}/levels-auto.json`,
    },
    limits,
    signal,
    levels,
    tradePlan: tradePlanOut,
    watchRevoked,
    activeWatch,
    watchSuppressed,
    newWatchIssued,
    news,
    retention: {
      ticksMaxLines: retention.ticksMaxLines,
      bars5mMaxLines: retention.bars5mMaxLines,
      bars15mMaxLines: retention.bars15mMaxLines,
      decisionsMaxLines: retention.decisionsMaxLines,
    },
    m5BarKey: payload.m5?.barKey ?? null,
    m15BarKey: payload.m15?.barKey ?? null,
    pollMs: record.ms,
  });

  writeStatus({
    ok: true,
    ts: nowIso,
    stateDir: getStateDir(),
    ticksPath: getTicksPath(),
    contextPath: getContextPath(),
    statusPath: getStatusPath(),
    isNew5mBar,
    isNew15mBar,
    m5Close: payload.m5?.c ?? null,
    m15Close: payload.m15?.c ?? null,
    levelsWatch: levels?.watch ?? false,
    nearestSupport: levels?.nearestSupport ?? null,
    nearestResistance: levels?.nearestResistance ?? null,
    watchRevoked: watchRevoked?.notify === true,
    error: null,
  });

  return { ok: true, record, summary };
}
