import { createDb } from "@shadowapi/db";
import { tenants } from "@shadowapi/db/schema";
import { eq } from "drizzle-orm";
import { LIVE_CAPS, liveCap } from "@shadowapi/core";
import { usageCounts } from "../../src/accounts";
import { liveRunsThisMonth } from "../../src/dashboard";
import { requireSession, setPlanAction } from "../actions";

const BLURB = {
  developer: "For trying the API. Ten live calls a month.",
  agency: "For a small integration. One hundred live calls a month.",
  enterprise: "For heavier use. One thousand live calls a month.",
};

export default async function UsagePage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const query = await searchParams;
  const session = await requireSession();
  const handle = createDb(process.env.DATABASE_URL!);
  const counts = await usageCounts(handle.db, session.tenantId);
  const month = await liveRunsThisMonth(handle.db, session.tenantId);
  const rows = await handle.db.select({ plan: tenants.plan }).from(tenants).where(eq(tenants.id, session.tenantId)).limit(1);
  await handle.close();
  const plan = rows[0]?.plan ?? "developer";
  const cap = liveCap(plan);
  return (
    <main className="customer-page">
      <header className="page-head">
        <h1>Plan</h1>
        <p>A live call is a new lookup that needs a worker. Reading a saved answer again does not count.</p>
      </header>
      {query.error ? <p className="banner">The plan was not changed. The gateway refused the request.</p> : null}
      <section className="stat-grid">
        <article className="stat">
          <span>This month</span>
          <strong>
            {month}
            <small> / {cap}</small>
          </strong>
        </article>
        <article className="stat">
          <span>Live calls, all time</span>
          <strong>{counts.live_run}</strong>
        </article>
        <article className="stat">
          <span>Saved lookups</span>
          <strong>{counts.cached_read}</strong>
        </article>
      </section>
      <section className="plan-grid">
        {(Object.keys(LIVE_CAPS) as Array<keyof typeof LIVE_CAPS>).map((next) => (
          <article className={next === plan ? "plan current" : "plan"} key={next}>
            <h2>{next}</h2>
            <p>{BLURB[next]}</p>
            <form action={setPlanAction}>
              <input type="hidden" name="plan" value={next} />
              <button type="submit" disabled={next === plan}>
                {next === plan ? "Current plan" : "Switch to this plan"}
              </button>
            </form>
          </article>
        ))}
      </section>
    </main>
  );
}
