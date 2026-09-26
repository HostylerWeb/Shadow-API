import { redirect } from "next/navigation";
import { createDb } from "@shadowapi/db";
import { requireAdmin } from "../../../src/admin";
import { requireSession } from "../../actions";

export default async function AdminHealthPage() {
  const session = await requireSession();
  const handle = createDb(process.env.DATABASE_URL!);
  if (!(await requireAdmin(handle.db, session.userId))) {
    await handle.close();
    redirect("/endpoints");
  }
  await handle.close();
  let health = "Gateway did not answer.";
  try {
    const res = await fetch(`${process.env.GATEWAY_URL ?? "http://localhost:3000"}/health`);
    health = await res.text();
  } catch {
    health = "Gateway did not answer.";
  }
  return (
    <main className="admin-page">
      <header className="page-head">
        <h1>Health</h1>
        <p>This is the API process, not the carrier website. Database ok means Postgres answered.</p>
      </header>
      <pre className="card">{health}</pre>
      <section className="card">
        <h2>Carrier playbook</h2>
        <ul>
          <li>SESSION_EXPIRED: the customer signs in again. Do not copy another tenant’s cookies.</li>
          <li>CHALLENGE_REQUIRED: a person must open the session. Do not retry the job.</li>
          <li>Repeated GRAPH_STEP_FAILED: leave the connector version in place until a repair is approved.</li>
        </ul>
      </section>
    </main>
  );
}
