import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { after, before, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { Redis } from "ioredis";
import { stubCacheKey, encryptVault, decryptVault } from "@shadowapi/core";
import { createDb } from "@shadowapi/db";
import { apiKeys, jobs, tenants, usageEvents, vaultSessions, graphRepairs } from "@shadowapi/db/schema";
import { eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { carrierCacheKey } from "@shadowapi/graph-runner";
import { closeBrowser, resolveCarrierProxy } from "../src/browser.js";
import { startStagingMirror } from "../src/live-carrier.js";
import { processQueuedJob, TenantBusyError } from "../src/process-job.js";
import { publishStudioConnector, signUp } from "../../portal/src/accounts.ts";

test("gateway package does not depend on camoufox-js", () => {
  const pkg = JSON.parse(
    readFileSync(new URL("../../gateway/package.json", import.meta.url), "utf8"),
  ) as { dependencies?: Record<string, string> };
  assert.equal(pkg.dependencies?.["camoufox-js"], undefined);
});

test("proxy uses datacenter first and sticky session suffix", () => {
  const previousDc = process.env.CARRIER_X_DATACENTER_PROXY;
  const previousRes = process.env.CARRIER_X_RESIDENTIAL_PROXY;
  process.env.CARRIER_X_DATACENTER_PROXY = "http://dc-user:secret@proxy.example:8080";
  process.env.CARRIER_X_RESIDENTIAL_PROXY = "http://res-user:secret@proxy.example:8081";
  const proxy = resolveCarrierProxy("sess-1");
  assert.equal(proxy?.server, "http://proxy.example:8080");
  assert.equal(proxy?.username, "dc-user-sticky-sess-1");
  delete process.env.CARRIER_X_DATACENTER_PROXY;
  const fallback = resolveCarrierProxy(null);
  assert.equal(fallback?.server, "http://proxy.example:8081");
  assert.equal(fallback?.username, "res-user");
  if (previousDc === undefined) delete process.env.CARRIER_X_DATACENTER_PROXY;
  else process.env.CARRIER_X_DATACENTER_PROXY = previousDc;
  if (previousRes === undefined) delete process.env.CARRIER_X_RESIDENTIAL_PROXY;
  else process.env.CARRIER_X_RESIDENTIAL_PROXY = previousRes;
});

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
    let staging: { origin: string; close: () => Promise<void> };

    before(async () => {
      process.env.VAULT_DATA_KEY ??= Buffer.alloc(32, 7).toString("base64");
      staging = await startStagingMirror();
      process.env.STAGING_ORIGIN = staging.origin;
    });

    beforeEach(async () => {
      await db.execute(sql`
        UPDATE jobs SET status = 'failed', failure_code = 'GRAPH_STEP_FAILED',
          failure_message = 'test cleanup', updated_at = NOW(), completed_at = NOW()
        WHERE status = 'running'
      `);
    });

    after(async () => {
      await closeBrowser();
      await staging.close();
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

    test("carrier_x_pod fixture replay writes catalog outputs", async () => {
      const [tenant] = await db
        .insert(tenants)
        .values({ name: `w-${randomBytes(4).toString("hex")}` })
        .returning();
      const [job] = await db
        .insert(jobs)
        .values({
          tenantId: tenant.id,
          connectorId: "carrier_x_pod",
          status: "queued",
          runMode: "live",
          inputs: { fixture: "in_transit", tracking_number: "IN1" },
        })
        .returning();
      await processQueuedJob(db, redis, job.id);
      const row = (await db.select().from(jobs).where(eq(jobs.id, job.id)).limit(1))[0];
      assert.equal(row.status, "succeeded");
      assert.equal(row.graphVersion, "v1.0.1-g2");
      assert.equal((row.outputs as { status: string }).status, "IN_TRANSIT");
    });

    async function carrierJob(inputs: Record<string, unknown>, sessionId?: string) {
      const [tenant] = await db
        .insert(tenants)
        .values({ name: `w-${randomBytes(4).toString("hex")}` })
        .returning();
      const [job] = await db
        .insert(jobs)
        .values({
          tenantId: tenant.id,
          connectorId: "carrier_x_pod",
          status: "queued",
          runMode: "live",
          sessionId,
          inputs,
        })
        .returning();
      return job.id;
    }

    test("live carrier status matches fixture shape", async () => {
      const jobId = await carrierJob({ tracking_number: "ABC123" });
      await processQueuedJob(db, redis, jobId);
      const row = (await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1))[0];
      assert.equal(row.status, "succeeded");
      assert.equal(row.graphVersion, "v1.0.1-g2");
      assert.equal((row.outputs as { status: string }).status, "IN_TRANSIT");
    });

    test("live challenge is blocked without retry", async () => {
      const jobId = await carrierJob({ tracking_number: "CHALLENGE" });
      await processQueuedJob(db, redis, jobId);
      const row = (await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1))[0];
      assert.equal(row.status, "blocked");
      assert.equal(row.failureCode, "CHALLENGE_REQUIRED");
    });

    test("live slow page is TARGET_TIMEOUT", async () => {
      const jobId = await carrierJob({ tracking_number: "SLOW", step_timeout_ms: 800 });
      await processQueuedJob(db, redis, jobId);
      const row = (await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1))[0];
      assert.equal(row.status, "failed");
      assert.equal(row.failureCode, "TARGET_TIMEOUT");
    });

    function cookieState(value: string) {
      return {
        cookies: [
          {
            name: "who",
            value,
            domain: "127.0.0.1",
            path: "/",
            expires: -1,
            httpOnly: false,
            secure: false,
            sameSite: "Lax" as const,
          },
        ],
        origins: [],
      };
    }

    test("two tenants keep separate vault cookies", async () => {
      async function tenantJob(mark: string) {
        const [tenant] = await db.insert(tenants).values({ name: `w-${mark}` }).returning();
        const sessionId = `sess-${mark}`;
        await db.insert(vaultSessions).values({
          tenantId: tenant.id,
          connectorId: "carrier_x_pod",
          sessionId,
          encryptedStorageState: encryptVault(JSON.stringify(cookieState(mark))),
        });
        const [job] = await db
          .insert(jobs)
          .values({
            tenantId: tenant.id,
            connectorId: "carrier_x_pod",
            status: "queued",
            runMode: "live",
            sessionId,
            inputs: { tracking_number: "ABC" },
          })
          .returning();
        return { tenantId: tenant.id, sessionId, jobId: job.id, mark };
      }
      const a = await tenantJob("aaa");
      const b = await tenantJob("bbb");
      await Promise.all([processQueuedJob(db, redis, a.jobId), processQueuedJob(db, redis, b.jobId)]);
      for (const item of [a, b]) {
        const vault = (
          await db
            .select()
            .from(vaultSessions)
            .where(eq(vaultSessions.tenantId, item.tenantId))
            .limit(1)
        )[0];
        const parsed = JSON.parse(decryptVault(vault.encryptedStorageState)) as {
          cookies: Array<{ name: string; value: string }>;
        };
        assert.equal(parsed.cookies.find((cookie) => cookie.name === "who")?.value, item.mark);
        assert.equal(
          parsed.cookies.some((cookie) => cookie.name === "who" && cookie.value !== item.mark),
          false,
        );
      }
    });

    test("delivered session stores blob id without a vendor url", async () => {
      const { jobId } = await queuedJob({
        fixture: "delivered_vault_session",
        tracking_number: "DV1",
        include_pod_document: true,
      });
      await db.update(jobs).set({ connectorId: "carrier_x_pod" }).where(eq(jobs.id, jobId));
      await processQueuedJob(db, redis, jobId);
      const row = (await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1))[0];
      assert.ok(row, "job row missing");
      assert.equal(row.status, "succeeded");
      const outputs = row.outputs as { status: string; document_blob_id: string; document_url?: string };
      assert.equal(outputs.status, "DELIVERED");
      assert.match(outputs.document_blob_id, /^pod-/);
      assert.equal(outputs.document_url, undefined);
      const cached = await redis.get(
        carrierCacheKey({ tracking_number: "DV1", include_pod_document: true }),
      );
      assert.equal(cached?.includes("document_url"), false);
      assert.equal(cached?.includes("127.0.0.1"), false);
    });

    test("bad zip is ARTIFACT_GATE_FAILED", async () => {
      const jobId = await carrierJob({ fixture: "bad_zip", tracking_number: "BZ1", include_pod_document: true });
      await processQueuedJob(db, redis, jobId);
      const row = (await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1))[0];
      assert.equal(row.status, "failed");
      assert.equal(row.failureCode, "ARTIFACT_GATE_FAILED");
    });

    test("expired vault session asks for reauth", async () => {
      const [tenant] = await db.insert(tenants).values({ name: "expired" }).returning();
      await db.insert(vaultSessions).values({
        tenantId: tenant.id,
        connectorId: "carrier_x_pod",
        sessionId: "dead",
        encryptedStorageState: encryptVault(JSON.stringify({ expired: true })),
      });
      const [job] = await db
        .insert(jobs)
        .values({
          tenantId: tenant.id,
          connectorId: "carrier_x_pod",
          status: "queued",
          runMode: "live",
          sessionId: "dead",
          inputs: { tracking_number: "ABC" },
        })
        .returning();
      await processQueuedJob(db, redis, job.id);
      const row = (await db.select().from(jobs).where(eq(jobs.id, job.id)).limit(1))[0];
      assert.equal(row.failureCode, "SESSION_EXPIRED");
      assert.match(row.failureMessage ?? "", /reauth/);
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

    test("published studio_tracking job returns graph outputs", async () => {
      const author = await signUp(db, `studio-${randomBytes(4).toString("hex")}@example.com`, "password-123", "author");
      const published = await publishStudioConnector(db, author.userId, author.tenantId, {
        url1: "https://staging.local/tracking",
        url2: "https://staging.local/tracking?tracking=123",
        pattern: "P2",
        inputName: "tracking_number",
        outputName: "status",
      });
      assert.equal(published.ok, true);
      const [job] = await db
        .insert(jobs)
        .values({
          tenantId: author.tenantId,
          connectorId: "studio_tracking",
          status: "queued",
          runMode: "live",
          inputs: { tracking_number: "ABC" },
        })
        .returning();
      await processQueuedJob(db, redis, job.id);
      const row = (await db.select().from(jobs).where(eq(jobs.id, job.id)).limit(1))[0];
      assert.equal(row.status, "succeeded");
      assert.equal((row.outputs as { status?: string }).status, "IN_TRANSIT");
      assert.equal(row.graphVersion, "v1.0.0-g1");
    });

    test("GRAPH_STEP_FAILED opens a repair and challenge or bad zip do not", async () => {
      const failed = await queuedJob({ stub_outcome: "failed" });
      await db.update(jobs).set({ connectorId: "carrier_x_pod" }).where(eq(jobs.id, failed.jobId));
      await processQueuedJob(db, redis, failed.jobId);
      const repairs = await db.select().from(graphRepairs).where(eq(graphRepairs.jobId, failed.jobId));
      assert.equal(repairs.length, 1);
      assert.match(repairs[0].accessibilitySnapshot, /role=status/);

      const challenge = await queuedJob({ fixture: "challenge_wall", tracking_number: "CHALLENGE" });
      await db.update(jobs).set({ connectorId: "carrier_x_pod" }).where(eq(jobs.id, challenge.jobId));
      await processQueuedJob(db, redis, challenge.jobId);
      const challengeRepairs = await db.select().from(graphRepairs).where(eq(graphRepairs.jobId, challenge.jobId));
      assert.equal(challengeRepairs.length, 0);

      const zip = await queuedJob({ fixture: "bad_zip", tracking_number: "BZ1" });
      await db.update(jobs).set({ connectorId: "carrier_x_pod" }).where(eq(jobs.id, zip.jobId));
      await processQueuedJob(db, redis, zip.jobId);
      const zipRepairs = await db.select().from(graphRepairs).where(eq(graphRepairs.jobId, zip.jobId));
      assert.equal(zipRepairs.length, 0);
    });

    test("warehouse fixture returns a status", async () => {
      const created = await queuedJob({ fixture: "found", receipt_id: "R1" });
      await db.update(jobs).set({ connectorId: "warehouse_x_receipt" }).where(eq(jobs.id, created.jobId));
      await processQueuedJob(db, redis, created.jobId);
      const row = (await db.select().from(jobs).where(eq(jobs.id, created.jobId)).limit(1))[0];
      assert.equal(row.status, "succeeded");
      assert.equal((row.outputs as { status?: string }).status, "RECEIVED");
    });
  });
}
