import Link from "next/link";
import { redirect } from "next/navigation";
import { createDb } from "@shadowapi/db";
import { PAGE_SIZE, adminJobs, requireAdmin } from "../../../src/admin";
import { requireSession } from "../../actions";
import { Pager } from "../../pager";

export default async function AdminJobsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; status?: string; connector?: string }>;
}) {
  const session = await requireSession();
  const query = await searchParams;
  const page = Number(query.page ?? 1) || 1;
  const status = query.status ?? "";
  const connector = query.connector ?? "";
  const handle = createDb(process.env.DATABASE_URL!);
  if (!(await requireAdmin(handle.db, session.userId))) {
    await handle.close();
    redirect("/endpoints");
  }
  const { rows, total } = await adminJobs(handle.db, page, status, connector);
  await handle.close();
  const href = (n: number) => `/admin/jobs?page=${n}&status=${status}&connector=${encodeURIComponent(connector)}`;
  return (
    <main className="admin-page">
      <header className="page-head">
        <h1>Jobs</h1>
        <p>Every job on the platform. Open a row to see the result or the failure, not the vault.</p>
      </header>
      <form className="filters" action="/admin/jobs">
        <select name="status" defaultValue={status}>
          <option value="">Any status</option>
          {["queued", "running", "succeeded", "failed", "cancelled", "blocked"].map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <input name="connector" defaultValue={connector} placeholder="Connector id" />
        <button type="submit">Filter</button>
      </form>
      <table>
        <thead>
          <tr>
            <th>Connector</th>
            <th>Status</th>
            <th>Tenant</th>
            <th>Created</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((job) => (
            <tr key={job.id}>
              <td>
                <Link href={`/admin/jobs/${job.id}`}>{job.connectorId}</Link>
              </td>
              <td>{job.status}</td>
              <td>{job.tenantId.slice(0, 8)}</td>
              <td>{job.createdAt.toISOString().slice(0, 16).replace("T", " ")}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <Pager page={page} total={total} pageSize={PAGE_SIZE} href={href} />
    </main>
  );
}
