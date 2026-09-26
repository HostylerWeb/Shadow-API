import Link from "next/link";
import { createDb } from "@shadowapi/db";
import { listUserEndpoints } from "../../src/accounts";
import { liveRunsThisMonth } from "../../src/dashboard";
import { liveCap } from "@shadowapi/core";
import { tenants } from "@shadowapi/db/schema";
import { eq } from "drizzle-orm";
import { deleteEndpointAction, requireSession } from "../actions";

export default async function EndpointsPage({ searchParams }: { searchParams: Promise<{ published?: string }> }) {
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
      {query.published ? <p className="banner">Published. Test it below or call it with an API key.</p> : null}
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
                <h2>{row.title}</h2>
                <p>{row.description}</p>
                {row.startUrl ? <p className="muted">{row.startUrl}</p> : null}
                <p className="api-id">
                  API id: <code>{row.connectorId}</code>
                </p>
              </div>
              <div className="endpoint-actions">
                <Link href={`/endpoints/test?connector=${encodeURIComponent(row.connectorId)}`}>Test</Link>
                <Link href={`/endpoints/${encodeURIComponent(row.connectorId)}/edit`}>Edit</Link>
                <form action={deleteEndpointAction}>
                  <input type="hidden" name="connector_id" value={row.connectorId} />
                  <button type="submit" className="btn-ghost">
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
