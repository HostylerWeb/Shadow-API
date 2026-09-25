import { createDb } from "@shadowapi/db";
import { tenants } from "@shadowapi/db/schema";
import { eq } from "drizzle-orm";
import { liveCap } from "@shadowapi/core";
import { usageCounts } from "../../src/accounts";
import { requireSession } from "../actions";

export default async function UsagePage() {
  const session = await requireSession();
  const handle = createDb(process.env.DATABASE_URL!);
  const counts = await usageCounts(handle.db, session.tenantId);
  const rows = await handle.db.select({ plan: tenants.plan }).from(tenants).where(eq(tenants.id, session.tenantId)).limit(1);
  await handle.close();
  const plan = rows[0]?.plan ?? "developer";
  return (
    <main>
      <h1>Usage</h1>
      <p>Plan: {plan}</p>
      <p>Live cap this month: {liveCap(plan)}</p>
      <p>Cached reads: {counts.cached_read}</p>
      <p>Live runs: {counts.live_run}</p>
    </main>
  );
}
