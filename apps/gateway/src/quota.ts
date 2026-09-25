import { and, count, eq, gte } from "drizzle-orm";
import type { Redis } from "ioredis";
import { liveCap } from "@shadowapi/core";
import type { Db } from "@shadowapi/db";
import { tenants, usageEvents } from "@shadowapi/db/schema";

const WINDOW_SECONDS = 60;
const REQUESTS_PER_WINDOW = 60;

export async function liveRunsThisMonth(db: Db, tenantId: string): Promise<number> {
  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  const rows = await db
    .select({ n: count() })
    .from(usageEvents)
    .where(
      and(eq(usageEvents.tenantId, tenantId), eq(usageEvents.kind, "live_run"), gte(usageEvents.createdAt, start)),
    );
  return Number(rows[0]?.n ?? 0);
}

export async function overLiveCap(db: Db, tenantId: string): Promise<boolean> {
  const rows = await db.select({ plan: tenants.plan }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  const cap = liveCap(rows[0]?.plan ?? "developer");
  return (await liveRunsThisMonth(db, tenantId)) >= cap;
}

export async function rateLimited(redis: Redis, apiKeyId: string, connectorId: string): Promise<boolean> {
  const keys = [`rl:key:${apiKeyId}`, `rl:key:${apiKeyId}:${connectorId}`];
  for (const key of keys) {
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, WINDOW_SECONDS);
    if (count > REQUESTS_PER_WINDOW) return true;
  }
  return false;
}
