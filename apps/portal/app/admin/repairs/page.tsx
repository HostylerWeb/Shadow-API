import { redirect } from "next/navigation";
import { createDb } from "@shadowapi/db";
import { PAGE_SIZE, adminRepairs, requireAdmin } from "../../../src/admin";
import { approveRepairAction, requireSession } from "../../actions";
import { Pager } from "../../pager";

export default async function AdminRepairsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; approved?: string; error?: string }>;
}) {
  const session = await requireSession();
  const query = await searchParams;
  const page = Number(query.page ?? 1) || 1;
  const handle = createDb(process.env.DATABASE_URL!);
  if (!(await requireAdmin(handle.db, session.userId))) {
    await handle.close();
    redirect("/endpoints");
  }
  const { rows, total } = await adminRepairs(handle.db, page);
  await handle.close();
  return (
    <main className="admin-page">
      <header className="page-head">
        <h1>Repairs</h1>
        <p>
          When a live step breaks with GRAPH_STEP_FAILED, the worker stores a snapshot and a suggested graph change.
          Approving it runs the staging replay, then updates the graph version only. The public fields stay the same.
          Wrong zip, a challenge, and validation errors never show up here.
        </p>
      </header>
      {query.approved ? <p className="banner">Graph version promoted. Connector version is unchanged.</p> : null}
      {query.error ? <p className="banner">Replay did not pass. The graph version was left as it is.</p> : null}
      {rows.length === 0 ? <p className="card">No repairs waiting.</p> : null}
      <ul className="repair-list">
        {rows.map((repair) => (
          <li key={repair.id} className="card">
            <p>
              <strong>{repair.connectorId}</strong> · last good graph {repair.lastGoodGraphVersion}
            </p>
            <p>Snapshot: {repair.accessibilitySnapshot}</p>
            <pre>{JSON.stringify(repair.proposedDiff, null, 2)}</pre>
            <form action={approveRepairAction}>
              <input type="hidden" name="id" value={repair.id} />
              <input type="hidden" name="next" value="/admin/repairs" />
              <button type="submit">Approve and promote graph</button>
            </form>
          </li>
        ))}
      </ul>
      <Pager page={page} total={total} pageSize={PAGE_SIZE} href={(n) => `/admin/repairs?page=${n}`} />
    </main>
  );
}
