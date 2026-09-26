import { redirect } from "next/navigation";
import { createDb } from "@shadowapi/db";
import { Redis } from "ioredis";
import { adminMetrics, adminOverview, requireAdmin } from "../../src/admin";
import { requireSession } from "../actions";

const LABELS: Record<string, string> = {
  CHALLENGE_REQUIRED: "Site asked for a human check. Do not retry automatically.",
  ARTIFACT_GATE_FAILED: "The proof-of-delivery file failed the zip check.",
  TARGET_TIMEOUT: "The page did not finish in time.",
  SESSION_EXPIRED: "Saved login expired. The customer must sign in again.",
  GRAPH_STEP_FAILED: "A connector step broke. It can enter the repair lane.",
};

export default async function AdminHome() {
  const session = await requireSession();
  const handle = createDb(process.env.DATABASE_URL!);
  const admin = await requireAdmin(handle.db, session.userId);
  if (!admin) {
    await handle.close();
    redirect("/endpoints");
  }
  const counts = await adminOverview(handle.db);
  const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6382");
  const metrics = await adminMetrics(redis);
  await redis.quit();
  await handle.close();
  const failureEntries = Object.entries(metrics.failures);
  return (
    <main className="admin-page">
      <header className="page-head">
        <h1>Overview</h1>
        <p>What the platform is doing right now.</p>
      </header>
      <section className="stat-grid">
        <article className="stat">
          <span>Waiting in queue</span>
          <strong>{metrics.queueDepth}</strong>
        </article>
        {counts.map((row) => (
          <article className="stat" key={row.status}>
            <span>{row.status}</span>
            <strong>{row.n}</strong>
          </article>
        ))}
      </section>
      <section className="card">
        <h2>Why jobs failed</h2>
        <p>These counts come from the worker. They reset only when Redis is cleared.</p>
        {failureEntries.length === 0 ? <p>No failure counts yet.</p> : null}
        <ul className="fail-list">
          {failureEntries.map(([code, n]) => (
            <li key={code}>
              <strong>{code}</strong>
              <span>{n}</span>
              <em>{LABELS[code] ?? "Recorded failure."}</em>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
