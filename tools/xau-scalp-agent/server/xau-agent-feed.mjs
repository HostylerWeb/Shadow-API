/**
 * Persist auto session levels from Pine XAUAGENT feed (5m snapshot).
 */
import fs from "node:fs";
import path from "node:path";
import { agentFeedToLevels } from "./parse-snapshot.js";

export function getAutoLevelsPath(stateDir) {
  return path.join(stateDir, "levels-auto.json");
}

export function writeAutoLevelsFromFeed(stateDir, agentFeed, ts) {
  if (!agentFeed?.ok) return null;
  const { supports, resistances } = agentFeedToLevels(agentFeed);
  const record = {
    ts,
    source: "pine_xauagent",
    supports,
    resistances,
    agentFeed,
  };
  const p = getAutoLevelsPath(stateDir);
  fs.writeFileSync(p, JSON.stringify(record, null, 2) + "\n", "utf8");
  return record;
}

export function readAutoLevels(stateDir) {
  const p = getAutoLevelsPath(stateDir);
  if (!fs.existsSync(p)) return { supports: [], resistances: [] };
  try {
    const j = JSON.parse(fs.readFileSync(p, "utf8"));
    return {
      supports: Array.isArray(j.supports) ? j.supports.filter(Number.isFinite) : [],
      resistances: Array.isArray(j.resistances) ? j.resistances.filter(Number.isFinite) : [],
      agentFeed: j.agentFeed ?? null,
      ts: j.ts ?? null,
    };
  } catch {
    return { supports: [], resistances: [] };
  }
}

/** When Pine XAUAGENT text is missing from legend, infer at least day H/L from archived 5m bars. */
export function enrichAgentFeed(agentFeed, { formingM5 = null, bars5m = [] } = {}) {
  const base = agentFeed ?? {
    dayHi: null,
    dayLo: null,
    asiaHi: null,
    asiaLo: null,
    lonHi: null,
    lonLo: null,
    nyHi: null,
    nyLo: null,
    sweepBear: false,
    sweepBull: false,
    ok: false,
  };
  if (base.ok) return base;

  const dayKey = formingM5?.ts
    ? new Date(formingM5.ts).toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);

  let dayHi = null;
  let dayLo = null;
  for (const b of bars5m) {
    if (!b?.ts) continue;
    if (new Date(b.ts).toISOString().slice(0, 10) !== dayKey) continue;
    if (b.h != null) dayHi = dayHi == null ? b.h : Math.max(dayHi, b.h);
    if (b.l != null) dayLo = dayLo == null ? b.l : Math.min(dayLo, b.l);
  }
  if (formingM5?.h != null) dayHi = dayHi == null ? formingM5.h : Math.max(dayHi, formingM5.h);
  if (formingM5?.l != null) dayLo = dayLo == null ? formingM5.l : Math.min(dayLo, formingM5.l);

  if (dayHi == null && dayLo == null) return base;

  return {
    ...base,
    dayHi: base.dayHi ?? dayHi,
    dayLo: base.dayLo ?? dayLo,
    ok: base.dayHi != null || base.dayLo != null || dayHi != null,
    source: base.ok ? "pine" : "bars_fallback",
  };
}
