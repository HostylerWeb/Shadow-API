import { createHash, randomBytes } from "node:crypto";
import { after, describe, test } from "node:test";
import assert from "node:assert/strict";
import { Redis } from "ioredis";
import { stubCacheKey } from "@shadowapi/core";
import { createDb } from "@shadowapi/db";
import { apiKeys, jobs, tenants, usageEvents } from "@shadowapi/db/schema";
import { eq } from "drizzle-orm";
import { processQueuedJob, TenantBusyError } from "../src/process-job.js";

const databaseUrl = process.env.DATABASE_URL;
const redisUrl = process.env.REDIS_URL;

function hashKey(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

if (!databaseUrl || !redisUrl) {
  describe("worker processQueuedJob", () => {
    test("skipped — set DATABASE_URL and REDIS_URL", { skip: true }, () => {});
  });
} else {
  describe("worker processQueuedJob", () => {
    const { db, close } = createDb(databaseUrl);
    const redis = new Redis(redisUrl, { maxRetriesPerRequest: null });

    after(async () => {
      await redis.quit();
      await close();
    });

    async function queuedJob(inputs: Record<string, unknown> = { tracking_number: "ABC" }) {
      const [tenant] = await db
        .insert(tenants)
        .values({ name: `w-${randomBytes(4).toString("hex")}` })
        .returning();
      const secret = `sk_w_${randomBytes(8).toString("hex")}`;
      await db.insert(apiKeys).values({
        tenantId: tenant.id,
        name: "w",
        keyPrefix: secret.slice(0, 12),
        keyHash: hashKey(secret),
        scopes: [],
      });
      const [job] = await db
        .insert(jobs)
        .values({
          tenantId: tenant.id,
          connectorId: "stub_connector",
          status: "queued",
          runMode: "live",
          inputs,
        })
        .returning();
      return { tenantId: tenant.id, jobId: job.id, inputs };
    }

    test("live job succeeds and writes cache", async () => {
      const { jobId, inputs } = await queuedJob();
      await processQueuedJob(db, redis, jobId);
      const row = (await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1))[0];
      assert.equal(row.status, "succeeded");
      assert.equal((row.outputs as { stub: boolean }).stub, true);
      const cached = await redis.get(stubCacheKey("stub_connector", inputs));
      assert.ok(cached);

      await processQueuedJob(db, redis, jobId);
      const usage = await db.select().from(usageEvents).where(eq(usageEvents.jobId, jobId));
      assert.equal(usage.length, 1);
    });

    test("forced failed and blocked", async () => {
      const failed = await queuedJob({ stub_outcome: "failed" });
      await processQueuedJob(db, redis, failed.jobId);
      const failedRow = (await db.select().from(jobs).where(eq(jobs.id, failed.jobId)).limit(1))[0];
      assert.equal(failedRow.status, "failed");
      assert.equal(failedRow.failureCode, "GRAPH_STEP_FAILED");

      const blocked = await queuedJob({ stub_outcome: "blocked" });
      await processQueuedJob(db, redis, blocked.jobId);
      const blockedRow = (await db.select().from(jobs).where(eq(jobs.id, blocked.jobId)).limit(1))[0];
      assert.equal(blockedRow.status, "blocked");
      assert.equal(blockedRow.failureCode, "CHALLENGE_REQUIRED");
    });

    test("tenant concurrency throws while another job is running", async () => {
      const first = await queuedJob({ tracking_number: "1" });
      await db.update(jobs).set({ status: "running" }).where(eq(jobs.id, first.jobId));
      const second = await queuedJob({ tracking_number: "2" });
      await db
        .update(jobs)
        .set({ tenantId: first.tenantId })
        .where(eq(jobs.id, second.jobId));
      await assert.rejects(
        () => processQueuedJob(db, redis, second.jobId, { tenantConcurrency: 1 }),
        TenantBusyError,
      );
    });
  });
}
