"use client";

type ResultShape = "list" | "single" | "object";

type Props = {
  resultShape: ResultShape;
  outputName: string;
  rows: Record<string, string>[];
  loading: boolean;
  error: string;
  totalRows?: number;
  onRefresh: () => void;
  canSample: boolean;
  resultShapeList: boolean;
  hasRow: boolean;
  fieldCount: number;
};

export function TeachApiPreview({
  resultShape,
  outputName,
  rows,
  loading,
  error,
  totalRows,
  onRefresh,
  canSample,
  hasRow,
  fieldCount,
}: Props) {
  const preview = buildPreview(resultShape, outputName, rows);

  let emptyHelp: string | null = null;
  if (!canSample) {
    if (resultShape === "list" && !hasRow) {
      emptyHelp = "After you set a result row and add fields, your API JSON will appear here.";
    } else if (resultShape === "list" && fieldCount === 0) {
      emptyHelp = "Add output fields from the page — the preview updates automatically.";
    } else {
      emptyHelp = "Add at least one output field from the page.";
    }
  }

  return (
    <section className="teach-preview-panel">
      <div className="teach-preview-head">
        <h3>Your API response</h3>
        <button type="button" className="btn-link" disabled={!canSample || loading} onClick={onRefresh}>
          Refresh
        </button>
      </div>
      <p className="muted teach-preview-sub">Live preview — this is what callers get after a successful job.</p>
      {error ? <p className="banner">{error}</p> : null}
      {!canSample && emptyHelp ? <p className="teach-preview-empty">{emptyHelp}</p> : null}
      {canSample && totalRows != null && resultShape === "list" && totalRows > 0 ? (
        <p className="muted teach-preview-meta">{totalRows} row{totalRows === 1 ? "" : "s"} on this page</p>
      ) : null}
      <pre className="api-preview teach-preview-code">
        {loading ? "Updating…" : canSample ? preview : "/* Preview appears here once row and fields are set */"}
      </pre>
    </section>
  );
}

function buildPreview(resultShape: ResultShape, outputName: string, rows: Record<string, string>[]): string {
  if (resultShape === "list") {
    if (rows.length === 0) return '{\n  "results": []\n}';
    return JSON.stringify({ results: rows.slice(0, 3) }, null, 2);
  }
  if (resultShape === "object") {
    return JSON.stringify(rows[0] ?? {}, null, 2);
  }
  const first = rows[0];
  const value = first?.[outputName] ?? first?.result ?? first?.[Object.keys(first ?? {})[0] ?? ""] ?? "…";
  return JSON.stringify({ [outputName]: value }, null, 2);
}
