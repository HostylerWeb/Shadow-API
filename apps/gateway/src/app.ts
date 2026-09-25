import Fastify, { type FastifyInstance } from "fastify";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { JOB_STATUSES } from "@shadowapi/core";
import type { Db } from "@shadowapi/db";
import { sql } from "drizzle-orm";
import { connectorVersions } from "@shadowapi/db/schema";
import { authenticateRequest } from "./auth.js";
import { registerBillingRoutes } from "./billing.js";
import { registerMcpRoute } from "./mcp.js";
import { registerJobRoutes, type CacheGet, type EnqueueJob } from "./routes/jobs.js";
import type { Redis } from "ioredis";

const openapiPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../docs/openapi/v1.openapi.json",
);

export type GatewayOptions = {
  enqueue?: EnqueueJob;
  cacheGet?: CacheGet;
  redis?: Redis;
};

export function buildGatewayApp(db: Db, options: GatewayOptions = {}): FastifyInstance {
  const app = Fastify({ logger: false });

  app.addHook("preHandler", async (request, reply) => {
    if (!request.url.startsWith("/v1")) return;
    if (request.url === "/v1/openapi.json" || request.url.startsWith("/v1/openapi.json?")) return;
    const auth = await authenticateRequest(db, request, reply);
    if (!auth) return;
    request.auth = auth;
  });

  app.get("/health", async () => {
    let database: "ok" | "error" = "ok";
    try {
      await db.execute(sql`SELECT 1`);
    } catch {
      database = "error";
    }
    return {
      ok: database === "ok",
      service: "gateway",
      jobStatuses: JOB_STATUSES,
      database,
    };
  });

  app.get("/v1/openapi.json", async (_, reply) => {
    const spec = readFileSync(openapiPath, "utf8");
    return reply.type("application/json").send(spec);
  });

  registerJobRoutes(app, db, { enqueue: options.enqueue, cacheGet: options.cacheGet, redis: options.redis });
  registerMcpRoute(app);
  registerBillingRoutes(app, db);

  app.get("/v1/connectors", async () => {
    const rows = await db.select().from(connectorVersions);
    return {
      connectors: rows.map((row) => ({
        connector_id: row.connectorId,
        connector_version: row.connectorVersion,
        graph_version: row.graphVersion,
      })),
    };
  });

  app.get("/v1/metrics", async () => {
    const redis = options.redis;
    if (!redis) {
      return { queue_depth: 0, cache_hits: 0, p95_poll_ms: 0, p95_live_ms: 0, failure_codes: {} };
    }
    const p95 = (raw: string[]) => {
      const values = raw.map(Number).filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
      if (!values.length) return 0;
      return values[Math.min(values.length - 1, Math.floor(values.length * 0.95))];
    };
    const [polls, lives, cacheHits, failures, queueDepth] = await Promise.all([
      redis.lrange("metrics:poll_ms", 0, 99),
      redis.lrange("metrics:live_ms", 0, 99),
      redis.get("metrics:cache_hits"),
      redis.hgetall("metrics:failures"),
      redis.llen("bull:shadowapi-jobs:wait"),
    ]);
    const failureCodes = Object.fromEntries(Object.entries(failures).map(([code, n]) => [code, Number(n)]));
    const errorTotal = Object.values(failureCodes).reduce((sum, n) => sum + n, 0);
    if (queueDepth > 20) console.log("alert queue_delay");
    if (errorTotal > 10) console.log("alert error_rate");
    return {
      queue_depth: queueDepth,
      cache_hits: Number(cacheHits ?? 0),
      p95_poll_ms: p95(polls),
      p95_live_ms: p95(lives),
      failure_codes: failureCodes,
    };
  });

  return app;
}
