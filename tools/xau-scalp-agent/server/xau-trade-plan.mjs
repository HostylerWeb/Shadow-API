/**
 * Draft entry / stop / TP from closed bars + context.levels (not an MT5 order).
 */
import { midPrice } from "./xau-signal.js";

function round2(n) {
  if (n == null || !Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}

function spreadUsd(m5) {
  if (!m5 || m5.spread == null) return 0.5;
  return Number(m5.spread) / 100;
}

function planLong({ closedBar, formingM5, levels, limits, signal }) {
  const ask = formingM5?.ask ?? null;
  const bid = formingM5?.bid ?? null;
  const mid = midPrice(formingM5) ?? signal?.executableMid ?? closedBar?.c;
  const atr = closedBar?.atr ?? formingM5?.atr ?? levels?.atr ?? null;
  const buffer = atr != null ? Math.min(0.15 * atr, 0.8) : 0.35;
  const slip = limits.maxSlippageUsd ?? 2.5;
  const minRR = limits.minNetRR ?? 1.5;
  const maxStopMult = limits.maxStopAtrMult ?? 1.2;

  const support = levels?.nearestSupport ?? closedBar?.l;
  const entryLow = round2(
    support != null && closedBar?.l != null
      ? Math.min(support, closedBar.l)
      : support ?? closedBar?.l ?? (mid != null ? mid - slip : null),
  );
  /** Worst-case long fill at ask (conservative R:R). */
  let entryHigh = ask != null ? round2(ask) : round2(mid != null ? mid + slip : null);
  if (entryLow != null && entryHigh != null && entryLow > entryHigh) {
    entryHigh = round2(entryLow + spreadUsd(formingM5));
  }

  let stop = round2(
    Math.min(
      closedBar?.l ?? Infinity,
      support ?? closedBar?.l ?? Infinity,
    ) - buffer,
  );
  if (!Number.isFinite(stop) || entryHigh == null || entryLow == null) {
    return { ok: false, direction: "long", reason: "missing entry/stop inputs" };
  }

  const stopDist = entryHigh - stop;
  if (atr != null && stopDist > maxStopMult * atr) {
    return {
      ok: false,
      direction: "long",
      reason: `stop distance $${round2(stopDist)} > ${maxStopMult}× ATR`,
      entryLow,
      entryHigh,
      stop,
    };
  }

  const spread = spreadUsd(formingM5);
  const netRisk = stopDist + spread;

  const resistances = [
    levels?.nearestResistance,
    levels?.sources?.m5RangeHigh,
    levels?.sources?.m15LastHigh,
  ].filter((x) => x != null && x > entryHigh);

  resistances.sort((a, b) => a - b);

  let tp1 = null;
  for (const r of resistances) {
    const reward = r - entryHigh - spread;
    if (netRisk > 0 && reward / netRisk >= minRR) {
      tp1 = round2(r);
      break;
    }
  }
  if (tp1 == null && netRisk > 0) {
    tp1 = round2(entryHigh + minRR * netRisk + spread);
  }

  const netRRtp1 =
    tp1 != null && netRisk > 0 ? round2((tp1 - entryHigh - spread) / netRisk) : null;

  const tp2Candidates = resistances.filter((r) => tp1 != null && r > tp1 + 0.1);
  const tp2 =
    tp2Candidates.length > 0
      ? round2(tp2Candidates[0])
      : tp1 != null
        ? round2(tp1 + (tp1 - entryHigh))
        : null;

  const meetsMinRR = netRRtp1 != null && netRRtp1 >= minRR;

  return {
    ok: meetsMinRR,
    direction: "long",
    entryLow,
    entryHigh,
    entryWorst: entryHigh,
    stop,
    tp1,
    tp2,
    netRRtp1,
    meetsMinRR,
    spreadUsed: round2(spread),
    note: meetsMinRR
      ? "Math-only plan — not entry confirmation"
      : "TP1 does not meet min net R:R — no ENTER",
  };
}

function planShort({ closedBar, formingM5, levels, limits, signal }) {
  const ask = formingM5?.ask ?? null;
  const bid = formingM5?.bid ?? null;
  const mid = midPrice(formingM5) ?? signal?.executableMid ?? closedBar?.c;
  const atr = closedBar?.atr ?? formingM5?.atr ?? levels?.atr ?? null;
  const buffer = atr != null ? Math.min(0.15 * atr, 0.8) : 0.35;
  const slip = limits.maxSlippageUsd ?? 2.5;
  const minRR = limits.minNetRR ?? 1.5;
  const maxStopMult = limits.maxStopAtrMult ?? 1.2;

  const resistance = levels?.nearestResistance ?? closedBar?.h;
  const entryHigh = round2(
    resistance != null && closedBar?.h != null
      ? Math.max(resistance, closedBar.h)
      : resistance ?? closedBar?.h ?? mid,
  );
  let entryLow = bid != null ? round2(bid) : round2(mid != null ? mid - slip : null);
  if (entryLow != null && entryHigh != null && entryLow > entryHigh) {
    entryLow = round2(entryHigh - spreadUsd(formingM5));
  }

  let stop = round2(
    Math.max(closedBar?.h ?? -Infinity, resistance ?? closedBar?.h ?? -Infinity) + buffer,
  );
  if (!Number.isFinite(stop) || entryHigh == null || entryLow == null) {
    return { ok: false, direction: "short", reason: "missing entry/stop inputs" };
  }

  const stopDist = stop - entryLow;
  if (atr != null && stopDist > maxStopMult * atr) {
    return {
      ok: false,
      direction: "short",
      reason: `stop distance $${round2(stopDist)} > ${maxStopMult}× ATR`,
      entryLow,
      entryHigh,
      stop,
    };
  }

  const spread = spreadUsd(formingM5);
  const netRisk = stopDist + spread;

  const supports = [
    levels?.nearestSupport,
    levels?.sources?.m5RangeLow,
    levels?.sources?.m15LastLow,
  ].filter((x) => x != null && x < entryLow);
  supports.sort((a, b) => b - a);

  let tp1 = null;
  for (const s of supports) {
    const reward = entryLow - s - spread;
    if (netRisk > 0 && reward / netRisk >= minRR) {
      tp1 = round2(s);
      break;
    }
  }
  if (tp1 == null && netRisk > 0) {
    tp1 = round2(entryLow - minRR * netRisk - spread);
  }

  const netRRtp1 =
    tp1 != null && netRisk > 0 ? round2((entryLow - tp1 - spread) / netRisk) : null;

  const tp2Candidates = supports.filter((s) => tp1 != null && s < tp1 - 0.1);
  const tp2 =
    tp2Candidates.length > 0
      ? round2(tp2Candidates[0])
      : tp1 != null
        ? round2(tp1 - (entryLow - tp1))
        : null;

  const meetsMinRR = netRRtp1 != null && netRRtp1 >= minRR;

  return {
    ok: meetsMinRR,
    direction: "short",
    entryLow,
    entryHigh,
    entryWorst: entryLow,
    stop,
    tp1,
    tp2,
    netRRtp1,
    meetsMinRR,
    spreadUsed: round2(spread),
    note: meetsMinRR
      ? "Math-only plan — not entry confirmation"
      : "TP1 does not meet min net R:R — no ENTER",
  };
}

/** User-facing block — fixed field order. */
export function formatTradePlanChat(plan, { draft = false } = {}) {
  if (!plan || plan.entryLow == null || plan.entryHigh == null) return null;
  const tag = draft ? "WATCH ONLY — not enter" : "Trade plan";
  const dir = plan.direction === "short" ? "Short" : "Long";
  const lines = [
    `**${tag} (${dir})** — idea to monitor; **you** decide on MT5 (not an order).`,
    `- **Entry range:** $${plan.entryLow} – $${plan.entryHigh}`,
    `- **Target (TP1):** $${plan.tp1 ?? "—"}`,
    `- **Stop loss:** $${plan.stop ?? "—"}`,
    `- **Take profit (TP2):** $${plan.tp2 ?? "—"}`,
  ];
  if (plan.netRRtp1 != null) lines.push(`- **Net R:R to TP1:** ~${plan.netRRtp1}`);
  if (plan.note) lines.push(`- **Note:** ${plan.note}`);
  return lines.join("\n");
}

/**
 * @param {object} opts
 * @param {object|null} opts.closedBar — archived M5 used for structure (signal bar when isNew5mBar)
 * @param {object|null} opts.formingM5
 * @param {object|null} opts.levels
 * @param {object} opts.limits
 * @param {object|null} opts.signal
 * @param {boolean} [opts.isNew5mBar]
 */
export function buildTradePlans({
  closedBar,
  formingM5,
  levels,
  limits,
  signal,
  isNew5mBar = false,
}) {
  if (!formingM5 && !closedBar) {
    return { plansComputed: false, reason: "no price data" };
  }

  const bar = closedBar ?? null;
  const long = planLong({ closedBar: bar, formingM5, levels, limits, signal });
  const short = planShort({ closedBar: bar, formingM5, levels, limits, signal });

  let primaryDirection = levels?.consider?.m15Bias === "bear" ? "short" : "long";
  if (levels?.consider?.shortAtResistance && !levels?.consider?.longAtSupport) {
    primaryDirection = "short";
  }
  if (levels?.consider?.longAtSupport && !levels?.consider?.shortAtResistance) {
    primaryDirection = "long";
  }

  const primary = primaryDirection === "short" ? short : long;

  const actionableWatch =
    Boolean(levels?.watch) &&
    Boolean(primary?.ok) &&
    (Boolean(levels?.consider?.longAtSupport) ||
      Boolean(levels?.consider?.shortAtResistance) ||
      Boolean(levels?.closedBar?.bounceAtSupport) ||
      Boolean(levels?.closedBar?.rejectionAtResistance));

  const hasFreshSignal = Boolean(isNew5mBar && signal && !signal.alreadyProcessed);

  return {
    plansComputed: true,
    /** candidate = math only; actionableWatch = may paste draft; signalBar = new closed M5 this poll */
    role: hasFreshSignal ? "signalBar" : actionableWatch ? "actionableWatch" : "candidate",
    candidateOnly: !hasFreshSignal && !actionableWatch,
    actionableWatch,
    hasFreshSignal,
    /** Always false in JSON — ENTER is agent decision after all hard filters */
    enterAllowed: false,
    disclaimer:
      "primary.meetsMinRR / primary.ok are filter math only — never sufficient for ENTER or actionable watch alone",
    primaryDirection,
    long,
    short,
    primary,
    chatEnter: null,
    chatEnterTemplate:
      hasFreshSignal && primary?.meetsMinRR
        ? formatTradePlanChat(primary, { draft: false })
        : null,
    chatDraft: actionableWatch ? formatTradePlanChat(primary, { draft: true }) : null,
  };
}
