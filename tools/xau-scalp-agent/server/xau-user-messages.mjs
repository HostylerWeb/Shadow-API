/** Plain-language strings for chat, brief, and phone (keep in sync). */

function round2(n) {
  if (n == null || !Number.isFinite(Number(n))) return null;
  return Math.round(Number(n) * 100) / 100;
}

export function simplifyDataIssue(issue) {
  if (!issue || typeof issue !== "string") return "Chart data looks wrong.";
  if (issue.includes("Market paused or rollover")) {
    return `${issue} — market is paused or in daily rollover. Wait for normal spread.`;
  }
  if (issue.includes("M15 mid vs legend C")) {
    const m = issue.match(/\$([\d.]+)/);
    return m
      ? `15m chart price is about $${m[1]} out of sync — refresh the 15m tab.`
      : "15m chart price is out of sync — refresh the 15m tab.";
  }
  if (issue.includes("M5 mid vs legend C")) {
    return "5m chart price is out of sync — refresh the 5m tab.";
  }
  if (issue.includes("barKey unchanged")) {
    return "Candle did not update — keep both chart tabs visible or refresh.";
  }
  if (issue.includes("spread")) return issue.replace("spread", "Spread");
  return issue;
}

export function simplifyPlanBlockReason(reason) {
  if (!reason) return null;
  if (reason.includes("stop distance") && reason.includes("ATR")) {
    return "Stop would be too far away for a scalp.";
  }
  if (reason.includes("min net R:R")) return "Reward vs risk is too small.";
  if (reason.includes("missing entry")) return "Not enough price levels to plan a trade.";
  return reason;
}

/**
 * Classify where live mid sits vs a cancelled/updated watch (we do not see MT5 fills).
 * @param {object} prev — direction, entryLow, entryHigh, stop, tp1, mid, revokeReasons, eventType
 * @returns {"tp1_hit"|"stop_broken"|"reversal_warning"|"flipped"|"favorable"|"in_zone"|"against"|"unknown"}
 */
export function classifyRevokeVsMid(prev) {
  if (prev.eventType === "tp1_hit") return "tp1_hit";
  if (prev.eventType === "stop_broken") return "stop_broken";
  if (prev.eventType === "reversal_warning") return "reversal_warning";
  if (prev.eventType === "hold_favorable") return "favorable";

  const reasons = prev.revokeReasons || [];
  if (reasons.some((r) => String(r).includes("target 1"))) return "tp1_hit";
  if (reasons.some((r) => String(r).includes("stop"))) return "stop_broken";
  if (reasons.some((r) => String(r).includes("reversal") || String(r).includes("against"))) {
    return "reversal_warning";
  }
  if (reasons.some((r) => String(r).includes("direction flipped"))) return "flipped";

  const mid = prev.mid != null && Number.isFinite(Number(prev.mid)) ? Number(prev.mid) : null;
  const lo = prev.entryLow != null ? Number(prev.entryLow) : null;
  const hi = prev.entryHigh != null ? Number(prev.entryHigh) : null;
  const stop = prev.stop != null ? Number(prev.stop) : null;
  const tp1 = prev.tp1 != null ? Number(prev.tp1) : null;

  if (mid == null || lo == null || hi == null) return "unknown";

  if (prev.direction === "long") {
    if (tp1 != null && mid >= tp1) return "tp1_hit";
    if (stop != null && mid <= stop) return "stop_broken";
    if (mid > hi) return "favorable";
    if (mid >= lo && mid <= hi) return "in_zone";
    return "against";
  }

  if (prev.direction === "short") {
    if (tp1 != null && mid <= tp1) return "tp1_hit";
    if (stop != null && mid >= stop) return "stop_broken";
    if (mid < lo) return "favorable";
    if (mid >= lo && mid <= hi) return "in_zone";
    return "against";
  }

  return "unknown";
}

/** Chat + journal when a watch changes state — explicit IF IN vs IF NOT IN. */
export function formatWatchCancelledChat(prev) {
  const dir = prev.direction === "short" ? "sell" : "buy";
  const Dir = prev.direction === "short" ? "Sell" : "Buy";
  const oppDir = prev.direction === "short" ? "up (against your sell)" : "down (against your buy)";
  const entry =
    prev.entryLow != null && prev.entryHigh != null
      ? `$${prev.entryLow}–$${prev.entryHigh}`
      : "the entry zone";
  const stop = prev.stop != null ? `$${prev.stop}` : "your stop";
  const tp1 = prev.tp1 != null ? `$${prev.tp1}` : "target 1";
  const tp2 = prev.tp2 != null ? `$${prev.tp2}` : null;
  const midVal = round2(prev.mid);
  const midStr = midVal != null ? `~$${midVal}` : "current price";
  const whyText = prev.adverseDetail || (prev.revokeReasons || []).join("; ") || "";

  const state = classifyRevokeVsMid(prev);

  if (state === "tp1_hit") {
    return [
      `**Target 1 reached on ${Dir} idea!** (entered ${entry} → **Target 1 ${tp1}** hit; price now ${midStr}).`,
      `- **If you ENTERED:** **Take profit** or lock your stop in profit${tp2 ? ` if holding a runner toward Target 2 (**${tp2}**)` : ""}.`,
      `- **If you did NOT enter:** Move is done — **do not enter now**. Wait for the next setup.`,
    ].join("\n");
  }

  if (state === "stop_broken") {
    return [
      `**Stop loss reached on ${Dir} idea** (was ${entry}, **stop ${stop}** hit; price now ${midStr}).`,
      `- **If you ENTERED:** **Exit now** if not already stopped out — the setup is invalidated.`,
      `- **If you did NOT enter:** **Stay out** — wait for a new setup.`,
    ].join("\n");
  }

  if (state === "reversal_warning" || state === "flipped") {
    return [
      `**WARNING — Price expected to turn ${oppDir}** (${Dir} from ${entry}, stop ${stop}, target ${tp1}; price now ${midStr}).`,
      whyText ? `- **Why:** ${whyText}.` : null,
      `- **If you ALREADY entered:** **Protect your trade now** — exit in profit/small loss or tighten stop to break-even. Do **not** let a winning trade turn into a full stop at ${stop}.`,
      `- **If you did NOT enter:** **Do not enter** this ${dir} anymore.`,
    ]
      .filter(Boolean)
      .join("\n");
  }

  if (state === "favorable") {
    return [
      `**${Dir} is moving in your favor — entry window closed** (zone was ${entry}, price now ${midStr}).`,
      `- **If you ALREADY entered in ${entry}:** **Stay in / hold** toward **Target 1 (${tp1})** with stop at **${stop}** (move stop to break-even once halfway to ${tp1}). We will alert you if price turns against you or hits ${tp1}.`,
      `- **If you did NOT enter:** **Do not enter late at ${midStr}** (do not chase). Wait for a pullback or a new alert.`,
    ].join("\n");
  }

  if (state === "against") {
    return [
      `**${Dir} setup weakening — price moved below/above entry zone** (zone ${entry}, stop ${stop}; price now ${midStr}).`,
      `- **If you ALREADY entered:** Price is pulling against ${entry} toward **stop ${stop}**. Respect your stop (**do not widen it**), or exit early if 5m closes past the zone.`,
      `- **If you did NOT enter:** **Do not enter now** — wait to see if support/resistance holds on a new signal.`,
    ].join("\n");
  }

  return [
    `**${Dir} alert expired for new entries** (was ${entry}, stop ${stop}, target ${tp1}; price now ${midStr}).`,
    `- **If you did NOT enter:** **Do not enter now** — wait for a fresh alert.`,
    `- **If you ALREADY entered:** Keep **stop ${stop}** and **target ${tp1}** only if the chart still supports it.`,
  ].join("\n");
}

/** Short text for ntfy notifications (no markdown, crystal clear). */
export function formatWatchCancelledNtfy(prev) {
  const Dir = prev.direction === "short" ? "Sell" : "Buy";
  const oppDir = prev.direction === "short" ? "UP against your Sell" : "DOWN against your Buy";
  const entry =
    prev.entryLow != null && prev.entryHigh != null
      ? `$${prev.entryLow}–$${prev.entryHigh}`
      : "zone";
  const stop = prev.stop != null ? `$${prev.stop}` : "?";
  const tp1 = prev.tp1 != null ? `$${prev.tp1}` : "?";
  const midVal = round2(prev.mid);
  const mid = midVal != null ? `$${midVal}` : "";
  const why = prev.adverseDetail ? ` (${prev.adverseDetail})` : "";

  const state = classifyRevokeVsMid(prev);

  if (state === "tp1_hit") {
    return `${Dir} (${entry}): TARGET 1 (${tp1}) HIT${mid ? ` at ${mid}` : ""}! IN TRADE: take profit or trail stop. NOT IN: move finished, stay out.`;
  }
  if (state === "stop_broken") {
    return `${Dir} (${entry}): STOP (${stop}) HIT${mid ? ` at ${mid}` : ""}. IN TRADE: idea invalidated — exit. NOT IN: stay out.`;
  }
  if (state === "reversal_warning" || state === "flipped") {
    return `WARNING ${Dir} (${entry}): price turning ${oppDir}${mid ? ` at ${mid}` : ""}${why}. IN TRADE: exit or move stop to break-even now! NOT IN: stay out.`;
  }
  if (state === "favorable") {
    return `${Dir} (${entry}): moving in profit${mid ? ` (${mid})` : ""}! IN TRADE: STAY IN toward ${tp1} (stop ${stop}); we'll alert if it reverses. NOT IN: don't chase late.`;
  }
  if (state === "against") {
    return `${Dir} (${entry}): pulling against zone${mid ? ` (${mid})` : ""} toward stop ${stop}. IN TRADE: watch stop ${stop} closely. NOT IN: do not enter.`;
  }
  return `${Dir} (${entry}) expired${mid ? ` (${mid})` : ""}. NOT IN: wait for new alert. IN TRADE: stop ${stop}, target ${tp1}.`;
}

/** Title for ntfy lifecycle event. */
export function formatWatchNtfyTitle(prev) {
  const Dir = prev.direction === "short" ? "Sell" : "Buy";
  const state = classifyRevokeVsMid(prev);
  if (state === "tp1_hit") return `XAU: ${Dir} Target 1 HIT!`;
  if (state === "stop_broken") return `XAU: ${Dir} Stop hit - exit`;
  if (state === "reversal_warning" || state === "flipped") {
    return `XAU: WARNING - ${Dir} reversing!`;
  }
  if (state === "favorable") return `XAU: ${Dir} in profit - HOLD if in`;
  return `XAU: ${Dir} closed for new entry`;
}

/** Short text for ntfy new watch. */
export function formatWatchNtfy(aw) {
  const dir = aw.direction === "short" ? "Sell" : "Buy";
  return `${dir} zone $${aw.entryLow}–$${aw.entryHigh} | Stop $${aw.stop} | Target 1 $${aw.tp1}${aw.tp2 ? ` | Target 2 $${aw.tp2}` : ""}. Enter only inside zone on MT5; we will alert you to hold, take profit, or exit if it reverses.`;
}

/** User-facing trade block (chat). */
export function formatTradePlanPlain(plan, { draft = false } = {}) {
  if (!plan || plan.entryLow == null || plan.entryHigh == null) return null;
  const dir = plan.direction === "short" ? "sell" : "buy";
  const head = draft
    ? `**Get ready — possible ${dir}** (you place the order on MT5; not automatic).`
    : `**Suggested ${dir} plan** (you place the order on MT5; not automatic).`;
  const lines = [
    head,
    `- **Enter only in zone:** **$${plan.entryLow} – $${plan.entryHigh}** (if price is already past this, do not chase)`,
    `- **Stop loss:** **$${plan.stop ?? "—"}**`,
    `- **Target 1 (scalp):** **$${plan.tp1 ?? "—"}**`,
  ];
  if (plan.tp2 != null) lines.push(`- **Target 2 (runner):** **$${plan.tp2}**`);
  if (plan.netRRtp1 != null) lines.push(`- **Reward vs risk (to Target 1):** ~**${plan.netRRtp1}×**`);
  lines.push(
    "- **Trade tracking:** Once alerted, the tool tracks this setup and will notify you to **HOLD in profit**, **TAKE PROFIT at Target 1**, or **EXIT early if price turns against you**.",
  );
  return lines.join("\n");
}
