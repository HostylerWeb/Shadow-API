/**
 * Persistent log of every chat-grade alert (draft watch / cancel).
 * Mirrors what the agent pastes in chat — one row per new watch or revoke.
 */
import fs from "node:fs";
import path from "node:path";
import { getStateDir } from "./xau-store-paths.js";

export function getSignalsPath() {
  return path.join(getStateDir(), "signals.jsonl");
}

export function getSignalJournalPath() {
  return path.join(getStateDir(), "signal-journal.md");
}

function ensureJournalHeader() {
  const p = getSignalJournalPath();
  if (fs.existsSync(p)) return;
  const header = `# XAU signal journal

Auto-updated when the poll loop issues a **draft watch** or **do not enter** cancel.
Machine-readable log: \`signals.jsonl\` (same folder).

| Label | Meaning |
|-------|---------|
| **DRAFT WATCH** | Prepare / limit zone — you decide on MT5 (not bot ENTER) |
| **DO NOT ENTER** | Prior draft cancelled — do not chase old prices |

---

`;
  fs.writeFileSync(p, header, "utf8");
}

function appendJournalBlock(title, bodyLines) {
  ensureJournalHeader();
  const block = `\n---\n\n### ${title}\n\n${bodyLines.join("\n")}\n`;
  fs.appendFileSync(getSignalJournalPath(), block, "utf8");
}

/**
 * @param {object} event
 */
export function appendSignalEvent(event) {
  const ts = event.ts || new Date().toISOString();
  const record = { ts, ...event };
  fs.mkdirSync(getStateDir(), { recursive: true });
  fs.appendFileSync(getSignalsPath(), `${JSON.stringify(record)}\n`, "utf8");

  if (event.type === "watch") {
    const dir = event.direction === "short" ? "Short" : "Long";
    appendJournalBlock(`${ts} — DRAFT WATCH (${dir})`, [
      `- **Action:** Prepare — **${dir}** (you place the order on MT5)`,
      `- **Entry range:** $${event.entryLow} – $${event.entryHigh}`,
      `- **Target (TP1):** $${event.tp1 ?? "—"}`,
      `- **Stop loss:** $${event.stop ?? "—"}`,
      `- **Take profit (TP2):** $${event.tp2 ?? "—"}`,
      event.netRRtp1 != null ? `- **Net R:R to TP1:** ~${event.netRRtp1}` : null,
      event.mid != null ? `- **Mid at alert:** $${event.mid}` : null,
      event.spread != null ? `- **Spread (pts):** ${event.spread}` : null,
      `- **Note:** Math-only — not automated ENTER confirmation`,
    ].filter(Boolean));
  } else if (event.type === "revoke") {
    const dir = event.direction === "short" ? "Short" : "Long";
    appendJournalBlock(`${ts} — DO NOT ENTER (cancelled ${dir})`, [
      `- **Action:** Do **not** enter the prior draft; do not chase`,
      `- **Was:** ${dir} $${event.entryLow} – $${event.entryHigh} → TP1 $${event.tp1 ?? "—"}`,
      event.reasons?.length ? `- **Why:** ${event.reasons.join("; ")}` : null,
      event.mid != null ? `- **Mid at cancel:** $${event.mid}` : null,
    ].filter(Boolean));
  } else if (event.type === "enter") {
    const dir = event.direction === "short" ? "Short" : "Long";
    appendJournalBlock(`${ts} — ENTER recommendation (${dir})`, [
      `- **Action:** Recommendation only — you executed / will execute on MT5`,
      `- **Entry range:** $${event.entryLow} – $${event.entryHigh}`,
      `- **Stop:** $${event.stop ?? "—"} | **TP1:** $${event.tp1 ?? "—"}`,
      event.note ? `- **Note:** ${event.note}` : null,
    ].filter(Boolean));
  }

  return record;
}
