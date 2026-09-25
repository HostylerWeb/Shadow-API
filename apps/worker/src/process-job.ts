import { stubCacheKey, STUB_CACHE_TTL_SECONDS, assertTransition, decryptVault, encryptVault } from "@shadowapi/core";
import type { Db } from "@shadowapi/db";
import { jobs, usageEvents, vaultSessions, connectorVersions, graphRepairs } from "@shadowapi/db/schema";
import {
  carrierCacheKey,
  loadCarrierFixture,
  loadCarrierManifest,
  loadGraph,
  loadWarehouseFixture,
  proposeRepairDiff,
  redactPii,
  replayStudioGraph,
  runCarrierFixture,
  runWarehouseFixture,
  STUDIO_CONNECTOR_ID,
  toCacheRecord,
  type CarrierRun,
  type NavigationPattern,
} from "@shadowapi/graph-runner";
import { and, count, eq, sql } from "drizzle-orm";
import type { Redis } from "ioredis";
import type { BrowserContextOptions } from "playwright-core";
import { runLiveCarrier, type LiveCarrierResult } from "./live-carrier.js";
import { proxyConfigError } from "./browser.js";
import { withSessionLock } from "./session-lock.js";

export class TenantBusyError extends Error {
  constructor() {
    super("TENANT_CONCURRENCY");
    this.name = "TenantBusyError";
  }
}

function stubOutputs(connectorId: string): Record<string, unknown> {
  return { stub: true, connector_id: connectorId, result: "ok" };
}

function cookieFingerprint(state: { cookies?: Array<{ name: string; value: string }> } | undefined): string {
  return JSON.stringify(state?.cookies ?? []);
}

async function finishCarrierRun(
  db: Db,
  redis: Redis,
  row: { id: string; tenantId: string; connectorId: string; connectorVersion: string | null; inputs: unknown },
  run: CarrierRun,
): Promise<void> {
  const inputs = (row.inputs ?? {}) as Record<string, unknown>;
  const now = new Date();
  assertTransition("running", run.jobStatus);
  const outputs = { ...run.outputs };
  delete outputs.document_url;
  if (run.jobStatus === "succeeded" && row.connectorId === "carrier_x_pod") {
    const cached = toCacheRecord(outputs);
    await redis.set(carrierCacheKey(inputs), JSON.stringify({ outputs: cached.body }), "EX", cached.ttl);
  }
  const messages: Record<string, string> = {
    SESSION_EXPIRED: "Session expired; reauth required",
    ARTIFACT_GATE_FAILED: "Artifact gate failed",
    CHALLENGE_REQUIRED: "Challenge required",
    TARGET_TIMEOUT: "Target timed out",
    GRAPH_STEP_FAILED: "Graph step failed",
  };
  await db
    .update(jobs)
    .set({
      status: run.jobStatus,
      graphVersion: run.graphVersion,
      outputs: run.jobStatus === "succeeded" ? outputs : null,
      failureCode: run.failureCode ?? null,
      failureMessage: run.failureCode ? (messages[run.failureCode] ?? run.failureCode) : null,
      updatedAt: now,
      completedAt: now,
    })
    .where(eq(jobs.id, row.id));
  if (run.failureCode) await redis.hincrby("metrics:failures", run.failureCode, 1);
  if (run.jobStatus === "succeeded" || run.jobStatus === "failed" || run.jobStatus === "blocked") {
    await db.insert(usageEvents).values({
      tenantId: row.tenantId,
      jobId: row.id,
      connectorId: row.connectorId,
      kind: "live_run",
    });
  }
  if (run.failureCode === "GRAPH_STEP_FAILED") {
    await recordGraphRepair(db, row, run.graphVersion);
  }
}

async function recordGraphRepair(
  db: Db,
  row: { id: string; tenantId: string; connectorId: string; connectorVersion: string | null },
  graphVersion: string,
): Promise<void> {
  const snapshot = "role=status name=shipment";
  const connectorVersion = row.connectorVersion ?? "1.0.1";
  await db.insert(graphRepairs).values({
    jobId: row.id,
    tenantId: row.tenantId,
    connectorId: row.connectorId,
    connectorVersion,
    lastGoodGraphVersion: graphVersion,
    accessibilitySnapshot: snapshot,
    proposedDiff: proposeRepairDiff({ connectorVersion, graphVersion, snapshot }),
    status: "pending",
  });
}

function carrierRunFromInputs(inputs: Record<string, unknown>): CarrierRun | null {
  const fixtureName = inputs.fixture;
  if (typeof fixtureName !== "string" || fixtureName.length === 0) {
    return null;
  }
  return runCarrierFixture(loadCarrierFixture(fixtureName));
}

export async function runningCount(db: Db, tenantId: string): Promise<number> {
  const rows = await db
    .select({ n: count() })
    .from(jobs)
    .where(and(eq(jobs.tenantId, tenantId), eq(jobs.status, "running")));
  return Number(rows[0]?.n ?? 0);
}

export async function connectorRunningCount(db: Db, connectorId: string): Promise<number> {
  const rows = await db
    .select({ n: count() })
    .from(jobs)
    .where(and(eq(jobs.connectorId, connectorId), eq(jobs.status, "running")));
  return Number(rows[0]?.n ?? 0);
}

export async function processQueuedJob(
  db: Db,
  redis: Redis,
  jobId: string,
  options: { tenantConcurrency?: number } = {},
): Promise<void> {
  const rows = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
  const row = rows[0];
  if (!row) return;
  if (row.status === "cancelled") {
    if (row.sessionId) await redis.del(`lock:${row.tenantId}:${row.connectorId}:${row.sessionId}`);
    console.log(`[worker] finish job_id=${jobId} cancelled`);
    return;
  }
  if (row.status !== "queued") {
    return;
  }

  const limit = options.tenantConcurrency ?? Number(process.env.TENANT_CONCURRENCY ?? 2);
  const connectorLimit = Number(process.env.CONNECTOR_CONCURRENCY ?? 4);
  const active = await runningCount(db, row.tenantId);
  const connectorActive = await connectorRunningCount(db, row.connectorId);
  if (active >= limit || connectorActive >= connectorLimit) {
    throw new TenantBusyError();
  }
  console.log(`[worker] start job_id=${jobId}`);

  assertTransition("queued", "running");
  await db.update(jobs).set({ status: "running", updatedAt: new Date() }).where(eq(jobs.id, jobId));

  const inputs = (row.inputs ?? {}) as Record<string, unknown>;
  const piiFields = row.connectorId === "carrier_x_pod" ? ["destination_zip", "signed_by"] : ["receipt_id"];
  console.log(`[worker] inputs job_id=${jobId} ${JSON.stringify(redactPii(piiFields, inputs))}`);
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
    await db.insert(usageEvents).values({
      tenantId: row.tenantId,
      jobId,
      connectorId: row.connectorId,
      kind: "live_run",
    });
    if (forced === "failed") await recordGraphRepair(db, row, row.graphVersion ?? "v1.0.1-g2");
    return;
  }

  if (row.connectorId === STUDIO_CONNECTOR_ID) {
    const published = await db
      .select()
      .from(connectorVersions)
      .where(
        and(
          eq(connectorVersions.connectorId, STUDIO_CONNECTOR_ID),
          sql`${connectorVersions.manifest}->>'tenant_id' = ${row.tenantId}`,
        ),
      )
      .limit(1);
    const manifest = published[0]?.manifest as {
      graph?: unknown;
      pattern?: NavigationPattern;
      output_name?: string;
    };
    const graph = manifest?.graph ? loadGraph(manifest.graph) : null;
    const pattern = manifest?.pattern;
    const replay = graph && pattern ? replayStudioGraph(graph, pattern) : null;
    const outputName = manifest?.output_name ?? "status";
    if (!replay?.ok) {
      await finishCarrierRun(db, redis, row, {
        jobStatus: "failed",
        failureCode: "GRAPH_STEP_FAILED",
        outputs: {},
        graphVersion: published[0]?.graphVersion ?? "v1.0.0-g1",
      });
      return;
    }
    await finishCarrierRun(db, redis, row, {
      jobStatus: "succeeded",
      outputs: { [outputName]: replay.businessEnum },
      graphVersion: replay.graphVersion,
    });
    return;
  }

  if (row.connectorId === "warehouse_x_receipt") {
    const fixtureName = typeof inputs.fixture === "string" ? inputs.fixture : "";
    if (!fixtureName) {
      await finishCarrierRun(db, redis, row, {
        jobStatus: "failed",
        failureCode: "VALIDATION_ERROR",
        outputs: {},
        graphVersion: "v1.0.0-g1",
      });
      return;
    }
    await finishCarrierRun(db, redis, row, runWarehouseFixture(loadWarehouseFixture(fixtureName)));
    return;
  }

  if (row.connectorId === "carrier_x_pod") {
    const fixtureRun = carrierRunFromInputs(inputs);
    if (fixtureRun) {
      await finishCarrierRun(db, redis, row, fixtureRun);
      return;
    }
    if (proxyConfigError()) {
      assertTransition("running", "failed");
      await db
        .update(jobs)
        .set({
          status: "failed",
          failureCode: "PROXY_UNAVAILABLE",
          failureMessage: "Proxy URL is invalid",
          updatedAt: now,
          completedAt: now,
        })
        .where(eq(jobs.id, jobId));
      await redis.incr("metrics:fail:PROXY_UNAVAILABLE");
      await db.insert(usageEvents).values({
        tenantId: row.tenantId,
        jobId,
        connectorId: row.connectorId,
        kind: "live_run",
      });
      return;
    }

    const stagingOrigin = process.env.STAGING_ORIGIN;
    if (!stagingOrigin) {
      assertTransition("running", "failed");
      await db
        .update(jobs)
        .set({
          status: "failed",
          failureCode: "GRAPH_STEP_FAILED",
          failureMessage: "STAGING_ORIGIN is required for a live carrier_x_pod run",
          updatedAt: now,
          completedAt: now,
        })
        .where(eq(jobs.id, jobId));
      await db.insert(usageEvents).values({
        tenantId: row.tenantId,
        jobId,
        connectorId: row.connectorId,
        kind: "live_run",
      });
      await recordGraphRepair(db, row, row.graphVersion ?? "v1.0.1-g2");
      return;
    }

    let storageState: BrowserContextOptions["storageState"] | undefined;
    let vaultId: string | undefined;
    let generation = 1;
    if (row.sessionId) {
      const sessions = await db
        .select()
        .from(vaultSessions)
        .where(
          and(
            eq(vaultSessions.tenantId, row.tenantId),
            eq(vaultSessions.connectorId, row.connectorId),
            eq(vaultSessions.sessionId, row.sessionId),
          ),
        )
        .limit(1);
      const vault = sessions[0];
      if (!vault) {
        await finishCarrierRun(db, redis, row, {
          jobStatus: "failed",
          failureCode: "SESSION_EXPIRED",
          outputs: {},
          graphVersion: "v1.0.1-g2",
        });
        return;
      }
      const parsed = JSON.parse(decryptVault(vault.encryptedStorageState)) as { expired?: boolean };
      if (parsed.expired) {
        await finishCarrierRun(db, redis, row, {
          jobStatus: "failed",
          failureCode: "SESSION_EXPIRED",
          outputs: {},
          graphVersion: "v1.0.1-g2",
        });
        return;
      }
      storageState = parsed as BrowserContextOptions["storageState"];
      vaultId = vault.id;
      generation = vault.sessionGeneration;
    }

    const tracking = typeof inputs.tracking_number === "string" ? inputs.tracking_number : "";
    const declared = loadCarrierManifest().session_lock_mode ?? "exclusive";
    const lockMode = row.sessionId ? "exclusive" : declared === "none" ? "none" : "none";
    const live = async (): Promise<LiveCarrierResult> =>
      runLiveCarrier({
        trackingNumber: tracking,
        stagingOrigin,
        sessionId: row.sessionId,
        storageState,
        timeoutMs: typeof inputs.step_timeout_ms === "number" ? inputs.step_timeout_ms : undefined,
        includePod: inputs.include_pod_document === true,
        tenantId: row.tenantId,
        jobId: row.id,
      });
    const run = row.sessionId
      ? await withSessionLock(redis, `lock:${row.tenantId}:${row.connectorId}:${row.sessionId}`, lockMode, live)
      : await live();

    if (vaultId && run.storageState) {
      const previous = typeof storageState === "string" ? undefined : storageState;
      const next = typeof run.storageState === "string" ? undefined : run.storageState;
      const changed = cookieFingerprint(next) !== cookieFingerprint(previous);
      await db
        .update(vaultSessions)
        .set({
          encryptedStorageState: encryptVault(JSON.stringify(run.storageState)),
          sessionGeneration: generation + (changed ? 1 : 0),
          updatedAt: new Date(),
        })
        .where(eq(vaultSessions.id, vaultId));
    }
    await finishCarrierRun(db, redis, row, run);
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
