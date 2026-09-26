import { createDb } from "@shadowapi/db";
import { authorIsActive, listPendingRepairs, loadPortalUser } from "../../src/accounts";
import { approveRepairAction, requireSession } from "../actions";
import { redirect } from "next/navigation";

export default async function RepairsPage({ searchParams }: { searchParams: Promise<{ approved?: string; error?: string }> }) {
  const session = await requireSession();
  const query = await searchParams;
  const handle = createDb(process.env.DATABASE_URL!);
  const user = await loadPortalUser(handle.db, session.userId);
  if (!user || !authorIsActive(user.role, user.authorUntil)) {
    await handle.close();
    redirect("/endpoints");
  }
  const repairs = await listPendingRepairs(handle.db, session.tenantId);
  await handle.close();
  return (
    <main className="customer-page">
      <header className="page-head">
        <h1>Repairs</h1>
        <p>Author-only: approve a graph fix after a site change. Customers use My endpoints and Activity.</p>
      </header>
      {query.approved ? <p className="banner">Graph version promoted.</p> : null}
      {query.error ? <p className="banner">Replay did not pass.</p> : null}
      {repairs.length === 0 ? (
        <p className="card empty-state">No pending repairs.</p>
      ) : (
        <ul className="endpoint-list">
          {repairs.map((repair) => (
            <li key={repair.id} className="card">
              <p>
                <strong>{repair.connectorId}</strong> · {repair.lastGoodGraphVersion}
              </p>
              <pre>{repair.accessibilitySnapshot}</pre>
              <form action={approveRepairAction}>
                <input type="hidden" name="id" value={repair.id} />
                <button type="submit">Approve</button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
