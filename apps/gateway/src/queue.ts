import { Queue } from "bullmq";
import { Redis } from "ioredis";

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6380";

let queue: Queue | null = null;

export function getJobQueue(): Queue {
  if (!queue) {
    const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
    queue = new Queue("shadowapi-jobs", { connection });
  }
  return queue;
}
