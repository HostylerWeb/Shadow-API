"use client";

type Props = {
  rowSelector: string;
  rowCount: number | null;
  fieldCount: number;
  picking: boolean;
  disabled: boolean;
  onSetRow: () => void;
  onChangeRow: () => void;
};

export function TeachRowBlock({
  rowSelector,
  rowCount,
  fieldCount,
  picking,
  disabled,
  onSetRow,
  onChangeRow,
}: Props) {
  const hasRow = Boolean(rowSelector);

  return (
    <section className="teach-step-panel" aria-labelledby="teach-row-title">
      <div className="teach-step-panel-head">
        <span className="teach-step-panel-num">A</span>
        <div>
          <h3 id="teach-row-title">Pick one search result row</h3>
          <p className="teach-step-panel-lead">
            Click a <strong>single company</strong> (or one item) in the list — not the whole table. Every row like it becomes one entry in{" "}
            <code>results[]</code>.
          </p>
        </div>
      </div>

      {!hasRow ? (
        <button type="button" className="teach-step-panel-cta" disabled={disabled || picking} onClick={onSetRow}>
          {picking ? "Click one result in the website…" : "Set result row from page"}
        </button>
      ) : (
        <div className="teach-step-panel-done">
          <p className="teach-step-panel-status">✓ Row mapped</p>
          <p className="teach-row-meta">
            <code className="inline-url">{truncateSelector(rowSelector)}</code>
            {rowCount != null ? (
              <span className="muted"> — {rowCount} matching row{rowCount === 1 ? "" : "s"} on this page</span>
            ) : null}
          </p>
          {fieldCount > 0 ? (
            <p className="muted teach-step-panel-note">If you change the row, re-check output fields and the JSON preview.</p>
          ) : null}
          <button type="button" className="teach-step-panel-secondary" disabled={disabled || picking} onClick={onChangeRow}>
            Change row
          </button>
        </div>
      )}
    </section>
  );
}

function truncateSelector(sel: string): string {
  return sel.length <= 72 ? sel : `${sel.slice(0, 70)}…`;
}
