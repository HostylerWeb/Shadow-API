import Link from "next/link";
import { createDb } from "@shadowapi/db";
import { listUserEndpoints } from "../../src/accounts";
import { listTenantJobs } from "../../src/dashboard";
import { requireSession } from "../actions";

export default async function JobsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const session = await requireSession();
  const status = (await searchParams).status ?? "";
  const handle = createDb(process.env.DATABASE_URL!);
  const rows = await listTenantJobs(handle.db, session.tenantId, status);
  const titles = new Map((await listUserEndpoints(handle.db, session.tenantId)).map((row) => [row.connectorId, row.title]));
  await handle.close();
  return (
    <main className="customer-page">
      <header className="page-head">
        <h1>Activity</h1>
        <p>Every time your endpoint runs — from a test or from your server.</p>
      </header>
      <form className="filters" action="/jobs">
        <select name="status" defaultValue={status}>
          <option value="">All statuses</option>
          {["queued", "running", "succeeded", "failed", "cancelled", "blocked"].map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <button type="submit">Filter</button>
      </form>
      {rows.length === 0 ? (
        <p className="card empty-state">Nothing yet. Publish an endpoint and test it, or call it from your server.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Endpoint</th>
              <th>Status</th>
              <th>When</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((job) => (
              <tr key={job.id}>
                <td>
                  <Link href={`/jobs/${job.id}`}>{titles.get(job.connectorId) ?? job.connectorId}</Link>
                </td>
                <td>{job.status}</td>
                <td>{job.createdAt.toISOString().slice(0, 16).replace("T", " ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
