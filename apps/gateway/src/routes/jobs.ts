import type { FastifyInstance } from "fastify";
import { eq, and } from "drizzle-orm";
import {
  assertSessionBelongsToTenant,
  assertTransition,
  idempotencyExpiresAt,
  isTerminalStatus,
  resolveIdempotentJob,
  stubCacheKey,
  type JobStatus,
} from "@shadowapi/core";
import { carrierCacheKey, disallowedInputUrl, preflightCarrier, targetDomainsFor } from "@shadowapi/graph-runner";
import type { Db } from "@shadowapi/db";
import { connectorVersions, jobs, usageEvents, vaultSessions } from "@shadowapi/db/schema";
import type { AuthContext } from "../auth.js";
import { signedDocumentUrl } from "../sign-document.js";
import { overLiveCap, rateLimited } from "../quota.js";
import type { Redis } from "ioredis";
export type EnqueueJob = (jobId: string, tenantId: string) => Promise<void>;
export type CacheGet = (key: string) => Promise<string | null>;

type StartJobBody = {
  connector_id: string;
  connector_version?: string;
  inputs?: Record<string, unknown>;
  run_mode?: "live" | "cached";
  session_id?: string;
  idempotency_key?: string;
};

export function registerJobRoutes(
  app: FastifyInstance,
  db: Db,
  options: { enqueue?: EnqueueJob; cacheGet?: CacheGet; redis?: Redis } = {},
) {
  const enqueue =
    options.enqueue ??
    (async () => {
      throw new Error("Job enqueue not configured");
    });
  app.post<{ Body: StartJobBody }>("/v1/jobs", async (request, reply) => {
    const auth = request.auth as AuthContext;
    const body = request.body ?? {};
    const allowed = new Set([
      "connector_id",
      "connector_version",
      "inputs",
      "run_mode",
      "session_id",
      "idempotency_key",
    ]);
    const unknown = Object.keys(body).filter((key) => !allowed.has(key));
    if (unknown.length > 0) {
      return reply.code(400).send({
        failure: { code: "VALIDATION_ERROR", message: `Unknown field: ${unknown.join(", ")}` },
      });
    }

    const rawBody = body as StartJobBody & { cookies?: unknown; storage_state?: unknown; storageState?: unknown };
    if (rawBody.cookies !== undefined || rawBody.storage_state !== undefined || rawBody.storageState !== undefined) {
      return reply.code(400).send({
        failure: { code: "VALIDATION_ERROR", message: "Pass session_id only; cookies are not accepted" },
      });
    }

    if (!body.connector_id || typeof body.connector_id !== "string") {
      return reply.code(400).send({
        failure: { code: "VALIDATION_ERROR", message: "connector_id is required" },
      });
    }

    const runMode = body.run_mode ?? "live";
    if (body.connector_id === "carrier_x_pod") {
      const preflightError = preflightCarrier(body.inputs ?? {}, body.session_id);
      if (preflightError) {
        return reply.code(400).send({
          failure: { code: "VALIDATION_ERROR", message: preflightError },
        });
      }
    }
    const domainError = disallowedInputUrl(body.inputs ?? {}, targetDomainsFor(body.connector_id));
    if (domainError) {
      return reply.code(400).send({
        failure: { code: "VALIDATION_ERROR", message: domainError },
      });
    }
    if (runMode !== "live" && runMode !== "cached") {
      return reply.code(400).send({
        failure: { code: "VALIDATION_ERROR", message: "run_mode must be live or cached" },
      });
    }

    if (body.session_id) {
      const sessions = await db
        .select()
        .from(vaultSessions)
        .where(
          and(
            eq(vaultSessions.tenantId, auth.tenantId),
            eq(vaultSessions.connectorId, body.connector_id),
            eq(vaultSessions.sessionId, body.session_id),
          ),
        )
        .limit(1);
      if (!sessions[0]) {
        return reply.code(400).send({
          failure: { code: "VALIDATION_ERROR", message: "session_id not found for this connector" },
        });
      }
      assertSessionBelongsToTenant(sessions[0].tenantId, auth.tenantId);
    }

    if (body.idempotency_key) {
      const existing = await db
        .select({
          tenantId: jobs.tenantId,
          idempotencyKey: jobs.idempotencyKey,
          existingJobId: jobs.id,
          expiresAt: jobs.idempotencyExpiresAt,
        })
        .from(jobs)
        .where(
          and(eq(jobs.tenantId, auth.tenantId), eq(jobs.idempotencyKey, body.idempotency_key)),
        )
        .limit(1);

      const hit = resolveIdempotentJob(
        existing
          .filter((r) => r.idempotencyKey && r.expiresAt)
          .map((r) => ({
            tenantId: r.tenantId,
            idempotencyKey: r.idempotencyKey!,
            existingJobId: r.existingJobId,
            expiresAt: r.expiresAt!,
          })),
        auth.tenantId,
        body.idempotency_key,
      );
      if (hit) {
        const row = await db.select().from(jobs).where(eq(jobs.id, hit)).limit(1);
        if (row[0]) {
          return reply.code(200).send({
            job_id: row[0].id,
            status: row[0].status,
            poll_after_ms: 2000,
            graph_version: row[0].graphVersion,
          });
        }
      }
    }

    if (options.redis && (await rateLimited(options.redis, auth.apiKeyId, body.connector_id))) {
      return reply.code(429).send({
        failure: { code: "RATE_LIMITED", message: "Too many requests" },
      });
    }

    if (runMode === "live" && (await overLiveCap(db, auth.tenantId))) {
      return reply.code(429).send({
        failure: { code: "RATE_LIMITED", message: "Live quota exceeded" },
      });
    }

    const connectors = await db
      .select()
      .from(connectorVersions)
      .where(eq(connectorVersions.connectorId, body.connector_id))
      .limit(1);

    const connector = connectors[0];
    const graphVersion = connector?.graphVersion ?? null;
    const connectorVersion = body.connector_version ?? connector?.connectorVersion ?? null;
    const inputs = body.inputs ?? {};

    if (runMode === "cached") {
      const cacheKey =
        body.connector_id === "carrier_x_pod" ? carrierCacheKey(inputs) : stubCacheKey(body.connector_id, inputs);
      const raw = options.cacheGet ? await options.cacheGet(cacheKey) : null;
      if (!raw) {
        return reply.code(404).send({
          failure: { code: "VALIDATION_ERROR", message: "Cache miss" },
        });
      }
      const parsed = JSON.parse(raw) as { outputs?: Record<string, unknown> };
      const [cachedJob] = await db
        .insert(jobs)
        .values({
          tenantId: auth.tenantId,
          connectorId: body.connector_id,
          connectorVersion,
          graphVersion,
          status: "succeeded",
          runMode: "cached",
          sessionId: body.session_id,
          inputs,
          outputs: parsed.outputs ?? {},
          idempotencyKey: body.idempotency_key,
          idempotencyExpiresAt: body.idempotency_key ? idempotencyExpiresAt() : null,
          completedAt: new Date(),
        })
        .returning();
      await db.insert(usageEvents).values({
        tenantId: auth.tenantId,
        jobId: cachedJob.id,
        connectorId: body.connector_id,
        kind: "cached_read",
      });
      if (options.redis) await options.redis.incr("metrics:cache_hits");
      return reply.code(200).send({
        job_id: cachedJob.id,
        status: cachedJob.status,
        poll_after_ms: null,
        graph_version: cachedJob.graphVersion,
      });
    }

    const [created] = await db
      .insert(jobs)
      .values({
        tenantId: auth.tenantId,
        connectorId: body.connector_id,
        connectorVersion,
        graphVersion,
        status: "queued",
        runMode,
        sessionId: body.session_id,
        inputs,
        idempotencyKey: body.idempotency_key,
        idempotencyExpiresAt: body.idempotency_key ? idempotencyExpiresAt() : null,
      })
      .returning();

    if (runMode === "live") {
      await enqueue(created.id, auth.tenantId);
    }

    return reply.code(202).send({
      job_id: created.id,
      status: created.status,
      poll_after_ms: 2000,
      graph_version: created.graphVersion,
    });
  });

  app.get<{ Params: { id: string } }>("/v1/jobs/:id", async (request, reply) => {
    const started = Date.now();
    const auth = request.auth as AuthContext;
    const rows = await db
      .select()
      .from(jobs)
      .where(and(eq(jobs.id, request.params.id), eq(jobs.tenantId, auth.tenantId)))
      .limit(1);
    const job = rows[0];
    if (!job) {
      return reply.code(404).send({ failure: { code: "VALIDATION_ERROR", message: "Job not found" } });
    }

    if (options.redis) {
      await options.redis.lpush("metrics:poll_ms", String(Date.now() - started));
      await options.redis.ltrim("metrics:poll_ms", 0, 99);
    }
    return {
      job_id: job.id,
      status: job.status,
      result_ready: job.status === "succeeded",
      failure: job.failureCode ? { code: job.failureCode, message: job.failureMessage } : null,
      poll_after_ms: isTerminalStatus(job.status as JobStatus) ? null : 5000,
      graph_version: job.graphVersion,
    };
  });

  app.get<{ Params: { id: string } }>("/v1/jobs/:id/result", async (request, reply) => {
    const auth = request.auth as AuthContext;
    const rows = await db
      .select()
      .from(jobs)
      .where(and(eq(jobs.id, request.params.id), eq(jobs.tenantId, auth.tenantId)))
      .limit(1);
    const job = rows[0];
    if (!job) {
      return reply.code(404).send({ failure: { code: "VALIDATION_ERROR", message: "Job not found" } });
    }
    if (job.status !== "succeeded") {
      return reply.code(409).send({
        failure: { code: "VALIDATION_ERROR", message: "Result not ready" },
        status: job.status,
      });
    }
    const outputs = { ...((job.outputs ?? {}) as Record<string, unknown>) };
    if (typeof outputs.document_blob_id === "string") {
      outputs.document_url = await signedDocumentUrl(outputs.document_blob_id);
    }
    return { job_id: job.id, status: job.status, outputs };
  });

  app.delete<{ Params: { id: string } }>("/v1/jobs/:id", async (request, reply) => {
    const auth = request.auth as AuthContext;
    const rows = await db
      .select()
      .from(jobs)
      .where(and(eq(jobs.id, request.params.id), eq(jobs.tenantId, auth.tenantId)))
      .limit(1);
    const job = rows[0];
    if (!job) {
      return reply.code(404).send({ failure: { code: "VALIDATION_ERROR", message: "Job not found" } });
    }
    if (isTerminalStatus(job.status as JobStatus)) {
      return { job_id: job.id, status: job.status };
    }
    assertTransition(job.status as JobStatus, "cancelled");
    const [updated] = await db
      .update(jobs)
      .set({ status: "cancelled", updatedAt: new Date(), completedAt: new Date() })
      .where(eq(jobs.id, job.id))
      .returning();
    if (options.redis && job.sessionId) {
      await options.redis.del(`lock:${job.tenantId}:${job.connectorId}:${job.sessionId}`);
    }
    return { job_id: updated.id, status: updated.status };
  });
}
