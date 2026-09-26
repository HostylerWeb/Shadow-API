import Link from "next/link";
import { createDb } from "@shadowapi/db";
import { listUserEndpoints } from "../../src/accounts";
import { liveRunsThisMonth } from "../../src/dashboard";
import { liveCap } from "@shadowapi/core";
import { tenants } from "@shadowapi/db/schema";
import { eq } from "drizzle-orm";
import { deleteEndpointAction, renameEndpointAction, requireSession, setEndpointLimitAction } from "../actions";
import { EndpointCopy } from "./endpoint-copy";

export default async function EndpointsPage({ searchParams }: { searchParams: Promise<{ published?: string; ready?: string; limit?: string }> }) {
  const session = await requireSession();
  const query = await searchParams;
  const handle = createDb(process.env.DATABASE_URL!);
  const mine = await listUserEndpoints(handle.db, session.tenantId);
  const month = await liveRunsThisMonth(handle.db, session.tenantId);
  const tenant = (await handle.db.select({ plan: tenants.plan }).from(tenants).where(eq(tenants.id, session.tenantId)).limit(1))[0];
  await handle.close();
  const cap = liveCap(tenant?.plan ?? "developer");
  return (
    <main className="customer-page">
      <div className="page-toolbar">
        <div>
          <h1>My endpoints</h1>
          <p className="muted">Turn a website into an API: name it, define start and result URLs, call it from your server.</p>
        </div>
        <Link className="btn-primary" href="/endpoints/new">
          + New endpoint
        </Link>
      </div>
      {query.published ? <p className="banner">Published. Run the test, then say whether the result looks right. The endpoint stays off until you confirm it.</p> : null}
      {query.ready ? <p className="banner">Test confirmed. This endpoint can be called with an API key.</p> : null}
      {query.limit ? <p className="banner">Result limit saved. The next run uses that maximum.</p> : null}
      <p className="usage-line">
        Live calls this month: {month} / {cap}
      </p>
      {mine.length === 0 ? (
        <section className="card empty-state">
          <h2>No endpoints yet</h2>
          <p>Name it, add the start URL and description, then paste one example result URL to publish.</p>
          <Link className="btn-primary" href="/endpoints/new">
            Create your first endpoint
          </Link>
        </section>
      ) : (
        <ul className="endpoint-list">
          {mine.map((row) => (
            <li key={row.connectorId} className="card endpoint-card">
              <div>
                <div className="endpoint-heading">
                  <EndpointCopy connectorId={row.connectorId} title={row.title} description={row.description} action={renameEndpointAction} />
                  <span className={row.testPassed ? "status status-succeeded" : "status status-blocked"}>
                    {row.testPassed ? "Ready" : "Needs test"}
                  </span>
                </div>
                {row.startUrl ? <p className="muted endpoint-url">{row.startUrl}</p> : null}
                <p className="api-id">
                  API id: <code>{row.connectorId}</code>
                </p>
                <form action={setEndpointLimitAction} className="endpoint-limit">
                  <input type="hidden" name="connector_id" value={row.connectorId} />
                  <label>
                    Max results
                    <input name="max_results" type="number" min={1} max={500} defaultValue={row.maxResults} />
                  </label>
                  <button type="submit" className="btn-ghost">Save</button>
                </form>
              </div>
              <div className="endpoint-actions">
                <Link className="btn-primary" href={`/endpoints/test?connector=${encodeURIComponent(row.connectorId)}`}>Test</Link>
                <Link className="btn-ghost" href={`/endpoints/${encodeURIComponent(row.connectorId)}/edit`}>Edit fields</Link>
                <form action={deleteEndpointAction}>
                  <input type="hidden" name="connector_id" value={row.connectorId} />
                  <button type="submit" className="btn-danger">
                    Delete
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
