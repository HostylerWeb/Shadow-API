import { DelayedError, Worker } from "bullmq";
import { Redis } from "ioredis";
import { createDb } from "@shadowapi/db";
import { processQueuedJob, TenantBusyError } from "./process-job.js";

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6380";
const databaseUrl = process.env.DATABASE_URL;
const concurrency = Number(process.env.WORKER_CONCURRENCY ?? 2);

if (!databaseUrl) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
const { db, close: closeDb } = createDb(databaseUrl);

const worker = new Worker(
  "shadowapi-jobs",
  async (job) => {
    const jobId = job.data.jobId as string;
    const started = Date.now();
    try {
      await processQueuedJob(db, connection, jobId);
      console.log(`[worker] finish job_id=${jobId}`);
      await connection.lpush("metrics:live_ms", String(Date.now() - started));
      await connection.ltrim("metrics:live_ms", 0, 99);
    } catch (err) {
      if (err instanceof TenantBusyError) {
        await job.moveToDelayed(Date.now() + 500);
        throw new DelayedError("tenant concurrency");
      }
      throw err;
    }
  },
  { connection, concurrency },
);

worker.on("failed", (job, err) => {
  console.error(`[worker] failed ${job?.id}`, err);
});

console.log(`[worker] listening on queue shadowapi-jobs (concurrency=${concurrency})`);

const shutdown = async () => {
  await worker.close();
  await connection.quit();
  await closeDb();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
