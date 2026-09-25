import Fastify, { type FastifyInstance } from "fastify";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { JOB_STATUSES } from "@shadowapi/core";
import type { Db } from "@shadowapi/db";
import { sql } from "drizzle-orm";
import { authenticateRequest } from "./auth.js";
import { registerJobRoutes, type CacheGet, type EnqueueJob } from "./routes/jobs.js";

const openapiPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../docs/openapi/v1.openapi.json",
);

export type GatewayOptions = {
  enqueue?: EnqueueJob;
  cacheGet?: CacheGet;
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

  registerJobRoutes(app, db, { enqueue: options.enqueue, cacheGet: options.cacheGet });

  app.get("/v1/connectors", async () => ({
    connectors: [],
    note: "Publish connector_versions rows in Chapter 6",
  }));

  return app;
}
