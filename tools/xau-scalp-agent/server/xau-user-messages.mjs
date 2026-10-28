/** Plain-language strings for chat, brief, and phone (keep in sync). */

export function simplifyDataIssue(issue) {
  if (!issue || typeof issue !== "string") return "Chart data looks wrong.";
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
    return "5m candle did not update — keep the 5m tab visible or refresh.";
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

/** Chat + journal when a watch is cancelled. */
export function formatWatchCancelledChat(prev) {
  const dir = prev.direction === "short" ? "sell" : "buy";
  const entry =
    prev.entryLow != null && prev.entryHigh != null
      ? `$${prev.entryLow}–$${prev.entryHigh}`
      : "the old zone";
  const tp1 = prev.tp1 != null ? `$${prev.tp1}` : "the old target";
  return (
    `**Previous alert is cancelled.** It was a **${dir}** idea (${entry}, target ${tp1}). ` +
    `**Do not** open that trade now. Wait for a **new** alert.`
  );
}

/** Short text for ntfy stand-down (no markdown). */
export function formatWatchCancelledNtfy(prev) {
  const dir = prev.direction === "short" ? "Sell" : "Buy";
  const entry =
    prev.entryLow != null && prev.entryHigh != null
      ? `$${prev.entryLow}–$${prev.entryHigh}`
      : "prior zone";
  const tp1 = prev.tp1 != null ? `$${prev.tp1}` : "?";
  return `${dir} alert cancelled (${entry}, target ${tp1}). Do not use those levels.`;
}

/** Short text for ntfy new watch. */
export function formatWatchNtfy(aw) {
  const dir = aw.direction === "short" ? "Sell" : "Buy";
  return `${dir} setup: enter zone $${aw.entryLow}–$${aw.entryHigh}, stop $${aw.stop}, target $${aw.tp1}. You decide on MT5.`;
}

/** User-facing trade block (chat). */
export function formatTradePlanPlain(plan, { draft = false } = {}) {
  if (!plan || plan.entryLow == null || plan.entryHigh == null) return null;
  const dir = plan.direction === "short" ? "sell" : "buy";
  const head = draft
    ? `**Get ready — possible ${dir}** (you place the order; this is not automatic).`
    : `**Suggested ${dir} plan** (you place the order; this is not automatic).`;
  const lines = [
    head,
    `- Zone: **$${plan.entryLow} – $${plan.entryHigh}**`,
    `- Stop: **$${plan.stop ?? "—"}**`,
    `- Target 1: **$${plan.tp1 ?? "—"}**`,
  ];
  if (plan.tp2 != null) lines.push(`- Target 2: **$${plan.tp2}**`);
  if (plan.netRRtp1 != null) lines.push(`- About **${plan.netRRtp1}×** reward vs risk to target 1`);
  lines.push("- These are numbers only — wait for your own confirmation on the chart.");
  return lines.join("\n");
}
