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
    redirect("/keys");
  }
  const repairs = await listPendingRepairs(handle.db, session.tenantId);
  await handle.close();
  return (
    <main>
      <h1>Repairs</h1>
      <p>Approve a graph update. The connector version stays the same.</p>
      {query.approved ? <p>Graph version promoted.</p> : null}
      {query.error ? <p>Replay did not pass.</p> : null}
      <ul>
        {repairs.map((repair) => (
          <li key={repair.id}>
            {repair.connectorId} · {repair.lastGoodGraphVersion}
            <pre>{repair.accessibilitySnapshot}</pre>
            <form action={approveRepairAction}>
              <input type="hidden" name="id" value={repair.id} />
              <button type="submit">Approve</button>
            </form>
          </li>
        ))}
      </ul>
    </main>
  );
}
