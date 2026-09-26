import Link from "next/link";
import { redirect } from "next/navigation";
import { createDb } from "@shadowapi/db";
import { listApiKeys } from "../../../src/accounts";
import { getTenantConnector, listTenantConnectors } from "../../../src/dashboard";
import { Breadcrumb } from "../../breadcrumb";
import { requireSession, runJobAction } from "../../actions";
import { TestRunSection } from "./test-run-section";

export default async function TestEndpointPage({
  searchParams,
}: {
  searchParams: Promise<{ connector?: string; error?: string; published?: string; reason?: string }>;
}) {
  const session = await requireSession();
  const query = await searchParams;
  const handle = createDb(process.env.DATABASE_URL!);
  const mine = await listTenantConnectors(handle.db, session.tenantId);
  const connectorId = query.connector ?? mine[0]?.connectorId ?? "";
  const row = connectorId ? await getTenantConnector(handle.db, session.tenantId, connectorId) : null;
  const keys = (await listApiKeys(handle.db, session.tenantId)).filter((key) => !key.revokedAt);
  await handle.close();
  if (mine.length === 0) redirect("/endpoints/new");
  if (!row) redirect("/endpoints");
  const manifest = row.manifest as {
    title?: string;
    description?: string;
    result_url?: string;
    output_name?: string;
    sample_output?: string;
    inputs?: Record<string, { required?: boolean }>;
    outputs?: Record<string, { type?: string }>;
  };
  const outputName = manifest.output_name ?? "result";
  const sample = manifest.sample_output ?? "";
  const inputs = Object.entries(manifest.inputs ?? {});
  let example = JSON.stringify({ [outputName]: sample || "(value when the job runs)" }, null, 2);
  if (outputName === "results" && sample.startsWith("[")) {
    try {
      example = JSON.stringify({ results: JSON.parse(sample) }, null, 2);
    } catch {
      /* keep default */
    }
  } else if (outputName === "companies" && sample.startsWith("[")) {
    try {
      example = JSON.stringify({ results: JSON.parse(sample) }, null, 2);
    } catch {
      /* keep default */
    }
  }
  return (
    <main className="customer-page">
      <Breadcrumb items={[{ href: "/endpoints", label: "My endpoints" }, { label: manifest.title ?? "Test" }]} />
      <header className="page-head">
        <h1>{manifest.title ?? "Test endpoint"}</h1>
        <p>{manifest.description}</p>
      </header>
      {query.published ? (
        <p className="banner">Published. Paste your API key, run this call, then say on the job page whether the response looks right.</p>
      ) : null}
      {query.error ? (
        <p className="banner">
          {query.reason === "Live quota exceeded"
            ? "This account has used its live runs for the month. Upgrade the plan, or wait until next month, then run the test again."
            : query.reason
              ? `Could not start the test: ${query.reason}`
              : "Could not start the test. Check that the gateway is running."}
        </p>
      ) : null}

      <TestRunSection
        action={runJobAction}
        connectorId={connectorId}
        inputs={inputs}
        resultUrl={manifest.result_url}
        gateway={process.env.GATEWAY_URL ?? "http://localhost:3000"}
        keys={keys.map((key) => ({ name: key.name, keyPrefix: key.keyPrefix }))}
      />

      <details className="card test-run-details">
        <summary>Technical details (optional)</summary>
        <p className="muted">Result page URL pattern</p>
        <p>
          <code className="inline-url">{manifest.result_url ?? "—"}</code>
        </p>
        <p className="muted">Example JSON shape from when you taught this endpoint</p>
        <pre className="api-preview">{example}</pre>
      </details>

      <p>
        <Link href="/endpoints">My endpoints</Link> · <Link href="/jobs">Activity</Link> · <Link href="/keys">API keys</Link>
      </p>
    </main>
  );
}
