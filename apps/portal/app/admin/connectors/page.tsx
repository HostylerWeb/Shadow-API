import { redirect } from "next/navigation";
import { createDb } from "@shadowapi/db";
import { PAGE_SIZE, adminConnectors, requireAdmin } from "../../../src/admin";
import { requireSession } from "../../actions";
import { Pager } from "../../pager";

export default async function AdminConnectorsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const session = await requireSession();
  const page = Number((await searchParams).page ?? 1) || 1;
  const handle = createDb(process.env.DATABASE_URL!);
  if (!(await requireAdmin(handle.db, session.userId))) {
    await handle.close();
    redirect("/endpoints");
  }
  const { rows, total } = await adminConnectors(handle.db, page);
  await handle.close();
  return (
    <main className="admin-page">
      <header className="page-head">
        <h1>Connectors</h1>
        <p>Published versions. The public job API stays POST /v1/jobs. The graph version can change without changing the connector version.</p>
      </header>
      <table>
        <thead>
          <tr>
            <th>Id</th>
            <th>Version</th>
            <th>Graph</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>{row.connectorId}</td>
              <td>{row.connectorVersion}</td>
              <td>{row.graphVersion}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <Pager page={page} total={total} pageSize={PAGE_SIZE} href={(n) => `/admin/connectors?page=${n}`} />
    </main>
  );
}
