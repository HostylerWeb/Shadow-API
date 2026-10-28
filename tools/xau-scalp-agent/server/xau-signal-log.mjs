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
| **Get ready** | Possible setup — you decide on MT5 |
| **Cancelled** | Old alert is off — do not use those prices |

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
    appendJournalBlock(`${ts} — Get ready (${dir})`, [
      `- **${dir}** — you place the order on MT5`,
      `- Zone: $${event.entryLow} – $${event.entryHigh}`,
      `- Target 1: $${event.tp1 ?? "—"}`,
      `- Stop: $${event.stop ?? "—"}`,
      event.tp2 != null ? `- Target 2: $${event.tp2}` : null,
      event.netRRtp1 != null ? `- Reward vs risk (target 1): ~${event.netRRtp1}×` : null,
      event.mid != null ? `- Price at alert: $${event.mid}` : null,
    ].filter(Boolean));
  } else if (event.type === "revoke") {
    const dir = event.direction === "short" ? "Sell" : "Buy";
    appendJournalBlock(`${ts} — Alert cancelled (${dir})`, [
      `- Do **not** use the old zone`,
      `- Was: ${dir} $${event.entryLow} – $${event.entryHigh} → target $${event.tp1 ?? "—"}`,
      event.mid != null ? `- Price at cancel: $${event.mid}` : null,
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
