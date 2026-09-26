"use client";

import type { PickElementMeta, PickPayload } from "../../../../src/teach/protocol";
import type { PickMode } from "./use-teach-picker";

type Props = {
  mode: PickMode;
  payload: PickPayload;
  onConfirm: () => void;
  onCancel: () => void;
};

export function TeachPickConfirm({ mode, payload, onConfirm, onCancel }: Props) {
  const { title, subtitle } = titleForMode(mode);
  const hint = hintFor(mode, payload.meta, payload.text);
  const sample = payload.text?.trim() || "";
  const elementLabel = elementSummary(payload.meta);

  return (
    <section className="teach-pick-confirm" aria-labelledby="teach-pick-title">
      <div className="teach-pick-header">
        <span className="teach-pick-badge" aria-hidden>
          {badgeFor(payload.meta.kind)}
        </span>
        <div>
          <h3 id="teach-pick-title">{title}</h3>
          <p className="teach-pick-subtitle">{subtitle}</p>
        </div>
      </div>

      <p className="teach-pick-lead">
        The green outline in the website is what you clicked. Keep it only if that matches what your API should use.
      </p>

      <div className="teach-pick-cards">
        <div className="teach-pick-card">
          <span className="teach-pick-card-label">Element</span>
          <p className="teach-pick-card-value">{elementLabel}</p>
        </div>
        <div className="teach-pick-card teach-pick-card-wide">
          <span className="teach-pick-card-label">Sample from page</span>
          {sample ? (
            <pre className="teach-pick-sample">{truncate(sample, 200)}</pre>
          ) : (
            <p className="teach-pick-sample-empty">No visible text (common for empty inputs — still OK for form fields).</p>
          )}
        </div>
        {mode.kind === "pickRow" && payload.meta.matchingRows > 0 ? (
          <div className="teach-pick-card">
            <span className="teach-pick-card-label">Rows like this on page</span>
            <p className="teach-pick-card-value teach-pick-card-num">{payload.meta.matchingRows}</p>
          </div>
        ) : null}
      </div>

      {hint ? (
        <p className={`teach-pick-alert${hint.severity === "warn" ? " teach-pick-alert-warn" : ""}`} role="status">
          {hint.message}
        </p>
      ) : null}

      <div className="teach-pick-actions">
        <button type="button" className="btn-primary" onClick={onConfirm}>
          Yes, use this
        </button>
        <button type="button" className="teach-pick-cancel" onClick={onCancel}>
          No, pick again
        </button>
      </div>
    </section>
  );
}

function titleForMode(mode: PickMode): { title: string; subtitle: string } {
  switch (mode.kind) {
    case "pickRow":
      return { title: "Is this one repeating item?", subtitle: "The API repeats this pattern for every matching row on the page." };
    case "pickFormInput":
    case "pickReplaceFormField":
    case "pickInput":
      return { title: "Is this the form field?", subtitle: "Callers will send a value that fills this input." };
    case "pickNewField":
    case "pickReplaceField":
      return { title: "Is this the data you want?", subtitle: "This text (or block) becomes one key in the JSON response." };
    default:
      return { title: "Confirm this selection", subtitle: "Check the highlight in the website." };
  }
}

function badgeFor(kind: PickElementMeta["kind"]): string {
  if (kind === "input") return "⌨";
  if (kind === "repeating") return "▦";
  if (kind === "container") return "▢";
  return "◆";
}

function elementSummary(meta: PickElementMeta): string {
  const tag = meta.tag.toUpperCase();
  if (meta.kind === "input") return `${tag} · form input`;
  if (meta.kind === "repeating") return `${tag} · repeating row`;
  if (meta.kind === "container") return `${tag} · block / container`;
  return `${tag} · page element`;
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function hintFor(
  mode: PickMode,
  meta: PickElementMeta,
  text: string,
): { message: string; severity: "info" | "warn" } | null {
  if (mode.kind === "pickRow" && meta.matchingRows === 0) {
    return {
      severity: "warn",
      message: "No similar rows matched. Click one full result row, not the whole list wrapper.",
    };
  }
  if (mode.kind === "pickRow" && meta.matchingRows === 1) {
    return {
      severity: "warn",
      message: "Only one row matched. Click an item that shares the same layout as the others in the list.",
    };
  }
  if ((mode.kind === "pickNewField" || mode.kind === "pickReplaceField") && meta.kind === "container") {
    return {
      severity: "info",
      message: "Large block selected — OK if you want one big text field. Pick again for a single line or link.",
    };
  }
  if (mode.kind === "pickFormInput" || mode.kind === "pickReplaceFormField") {
    if (meta.kind !== "input" && meta.inputCount === 0) {
      return {
        severity: "warn",
        message: "This does not look like an input. Pick again and click an input, textarea, or select.",
      };
    }
  }
  if (mode.kind === "pickInput" && meta.kind !== "input" && meta.inputCount === 0) {
    return {
      severity: "warn",
      message: "This does not look like an input. Pick again and click an input, textarea, or select.",
    };
  }
  if (text.length > 160) {
    return {
      severity: "info",
      message: "Long text — API callers will receive a large string unless you pick a smaller element.",
    };
  }
  return null;
}
