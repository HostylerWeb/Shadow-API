import { stubCacheKey, STUB_CACHE_TTL_SECONDS, assertTransition } from "@shadowapi/core";
import type { Db } from "@shadowapi/db";
import { jobs, usageEvents } from "@shadowapi/db/schema";
import { and, count, eq } from "drizzle-orm";
import type { Redis } from "ioredis";

export class TenantBusyError extends Error {
  constructor() {
    super("TENANT_CONCURRENCY");
    this.name = "TenantBusyError";
  }
}

function stubOutputs(connectorId: string): Record<string, unknown> {
  return { stub: true, connector_id: connectorId, result: "ok" };
}

export async function runningCount(db: Db, tenantId: string): Promise<number> {
  const rows = await db
    .select({ n: count() })
    .from(jobs)
    .where(and(eq(jobs.tenantId, tenantId), eq(jobs.status, "running")));
  return Number(rows[0]?.n ?? 0);
}

export async function processQueuedJob(
  db: Db,
  redis: Redis,
  jobId: string,
  options: { tenantConcurrency?: number } = {},
): Promise<void> {
  const limit = options.tenantConcurrency ?? Number(process.env.TENANT_CONCURRENCY ?? 2);
  const rows = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
  const row = rows[0];
  if (!row || row.status !== "queued") {
    return;
  }

  const active = await runningCount(db, row.tenantId);
  if (active >= limit) {
    throw new TenantBusyError();
  }

  assertTransition("queued", "running");
  await db.update(jobs).set({ status: "running", updatedAt: new Date() }).where(eq(jobs.id, jobId));

  const inputs = (row.inputs ?? {}) as Record<string, unknown>;
  const forced = inputs.stub_outcome;
  const now = new Date();

  if (forced === "failed" || forced === "blocked") {
    const status = forced === "blocked" ? "blocked" : "failed";
    assertTransition("running", status);
    await db
      .update(jobs)
      .set({
        status,
        failureCode: forced === "blocked" ? "CHALLENGE_REQUIRED" : "GRAPH_STEP_FAILED",
        failureMessage: forced === "blocked" ? "Stub forced blocked" : "Stub forced failed",
        updatedAt: now,
        completedAt: now,
      })
      .where(eq(jobs.id, jobId));
    return;
  }

  const outputs = stubOutputs(row.connectorId);
  assertTransition("running", "succeeded");
  await db
    .update(jobs)
    .set({
      status: "succeeded",
      outputs,
      updatedAt: now,
      completedAt: now,
    })
    .where(eq(jobs.id, jobId));

  await redis.set(stubCacheKey(row.connectorId, inputs), JSON.stringify({ outputs }), "EX", STUB_CACHE_TTL_SECONDS);

  await db.insert(usageEvents).values({
    tenantId: row.tenantId,
    jobId,
    connectorId: row.connectorId,
    kind: "live_run",
  });
}
