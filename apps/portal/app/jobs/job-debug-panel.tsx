type LiveRunDebug = {
  steps?: string[];
  target?: string;
  finalUrl?: string;
  rowCount?: number;
  sampleRow?: Record<string, string>;
  error?: string;
};

export function JobDebugPanel({ debug }: { debug: unknown }) {
  if (!debug || typeof debug !== "object") return null;
  const d = debug as LiveRunDebug;
  const steps = d.steps ?? [];
  if (!steps.length && !d.error && d.target == null) return null;

  return (
    <section className="card job-debug-card">
      <h2>Run debug log</h2>
      <p className="muted">
        Step-by-step trace from the worker browser (URLs, selectors, row counts). Share this when troubleshooting a
        taught endpoint.
      </p>
      {d.target ? (
        <p className="job-debug-meta">
          <strong>Target URL</strong>{" "}
          <code className="job-debug-url">{d.target}</code>
        </p>
      ) : null}
      {d.finalUrl && d.finalUrl !== d.target ? (
        <p className="job-debug-meta">
          <strong>Final URL</strong> <code className="job-debug-url">{d.finalUrl}</code>
        </p>
      ) : null}
      {typeof d.rowCount === "number" ? (
        <p className="job-debug-meta">
          <strong>Rows extracted</strong> {d.rowCount}
        </p>
      ) : null}
      {d.error ? <p className="banner job-debug-error">{d.error}</p> : null}
      {d.sampleRow ? (
        <details className="job-debug-details">
          <summary>Sample first row</summary>
          <pre className="api-preview">{JSON.stringify(d.sampleRow, null, 2)}</pre>
        </details>
      ) : null}
      {steps.length ? (
        <ol className="job-debug-steps">
          {steps.map((step, i) => (
            <li key={i}>
              <code>{step}</code>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}
