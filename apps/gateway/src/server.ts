import { Redis } from "ioredis";
import { createDb } from "@shadowapi/db";
import { buildGatewayApp } from "./app.js";
import { getJobQueue } from "./queue.js";

const host = process.env.GATEWAY_HOST ?? "0.0.0.0";
const port = Number(process.env.GATEWAY_PORT ?? 3000);
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const { db, close: closeDb } = createDb(databaseUrl);
const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6380", { maxRetriesPerRequest: null });
const app = buildGatewayApp(db, {
  enqueue: async (jobId, tenantId) => {
    await getJobQueue().add("run", { jobId, tenantId }, { jobId, attempts: 8, backoff: { type: "fixed", delay: 300 } });
  },
  cacheGet: (key) => redis.get(key),
});

const start = async () => {
  await app.listen({ host, port });
};

const shutdown = async () => {
  await app.close();
  await redis.quit();
  await closeDb();
};

process.on("SIGINT", () => {
  shutdown().finally(() => process.exit(0));
});
process.on("SIGTERM", () => {
  shutdown().finally(() => process.exit(0));
});

start().catch((err) => {
  app.log.error(err);
  process.exit(1);
});
