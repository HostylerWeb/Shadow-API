import { and, count, desc, eq, ilike, sql } from "drizzle-orm";
import type { Redis } from "ioredis";
import type { Db } from "@shadowapi/db";
import { connectorVersions, graphRepairs, jobs, portalUsers, tenants, usageEvents } from "@shadowapi/db/schema";
import { loadPortalUser } from "./accounts.js";

export const PAGE_SIZE = 20;

export async function requireAdmin(db: Db, userId: string) {
  const user = await loadPortalUser(db, userId);
  if (!user || user.role !== "admin") return null;
  return user;
}

export async function adminOverview(db: Db) {
  const byStatus = await db
    .select({ status: jobs.status, n: sql<number>`count(*)::int` })
    .from(jobs)
    .groupBy(jobs.status);
  return byStatus;
}

export async function adminMetrics(redis: Redis) {
  const [queueDepth, failures] = await Promise.all([
    redis.llen("bull:shadowapi-jobs:wait"),
    redis.hgetall("metrics:failures"),
  ]);
  return {
    queueDepth,
    failures: Object.fromEntries(Object.entries(failures).map(([code, n]) => [code, Number(n)])),
  };
}

export async function adminTenants(db: Db, page = 1, q = "") {
  const offset = (page - 1) * PAGE_SIZE;
  const where = q ? ilike(portalUsers.email, `%${q}%`) : undefined;
  const rows = await db
    .select({
      id: tenants.id,
      name: tenants.name,
      plan: tenants.plan,
      email: portalUsers.email,
    })
    .from(tenants)
    .leftJoin(portalUsers, eq(portalUsers.tenantId, tenants.id))
    .where(where)
    .orderBy(tenants.name)
    .limit(PAGE_SIZE)
    .offset(offset);
  const totalRow = await db
    .select({ n: count() })
    .from(tenants)
    .leftJoin(portalUsers, eq(portalUsers.tenantId, tenants.id))
    .where(where);
  const usage = await db
    .select({ tenantId: usageEvents.tenantId, n: sql<number>`count(*)::int` })
    .from(usageEvents)
    .where(eq(usageEvents.kind, "live_run"))
    .groupBy(usageEvents.tenantId);
  const live = new Map(usage.map((row) => [row.tenantId, Number(row.n)]));
  return {
    rows: rows.map((row) => ({ ...row, liveRuns: live.get(row.id) ?? 0 })),
    total: Number(totalRow[0]?.n ?? 0),
  };
}

export async function adminTenant(db: Db, tenantId: string) {
  const tenant = (await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1))[0];
  if (!tenant) return null;
  const user = (await db.select().from(portalUsers).where(eq(portalUsers.tenantId, tenantId)).limit(1))[0];
  const { apiKeys, vaultSessions } = await import("@shadowapi/db/schema");
  const keys = await db
    .select({ id: apiKeys.id, name: apiKeys.name, keyPrefix: apiKeys.keyPrefix, revokedAt: apiKeys.revokedAt })
    .from(apiKeys)
    .where(eq(apiKeys.tenantId, tenantId));
  const sessions = await db
    .select({
      connectorId: vaultSessions.connectorId,
      sessionId: vaultSessions.sessionId,
      sessionGeneration: vaultSessions.sessionGeneration,
    })
    .from(vaultSessions)
    .where(eq(vaultSessions.tenantId, tenantId));
  const recent = await db.select().from(jobs).where(eq(jobs.tenantId, tenantId)).orderBy(desc(jobs.createdAt)).limit(10);
  return { tenant, user: user ?? null, keys, sessions, recent };
}

export async function adminJobs(db: Db, page = 1, status = "", connector = "") {
  const filters = [];
  if (status) filters.push(eq(jobs.status, status as "queued"));
  if (connector) filters.push(ilike(jobs.connectorId, `%${connector}%`));
  const where = filters.length ? and(...filters) : undefined;
  const offset = (page - 1) * PAGE_SIZE;
  const rows = await db.select().from(jobs).where(where).orderBy(desc(jobs.createdAt)).limit(PAGE_SIZE).offset(offset);
  const totalRow = await db.select({ n: count() }).from(jobs).where(where);
  return { rows, total: Number(totalRow[0]?.n ?? 0) };
}

export async function adminConnectors(db: Db, page = 1) {
  const offset = (page - 1) * PAGE_SIZE;
  const rows = await db.select().from(connectorVersions).orderBy(connectorVersions.connectorId).limit(PAGE_SIZE).offset(offset);
  const totalRow = await db.select({ n: count() }).from(connectorVersions);
  return { rows, total: Number(totalRow[0]?.n ?? 0) };
}

export async function adminRepairs(db: Db, page = 1) {
  const offset = (page - 1) * PAGE_SIZE;
  const where = eq(graphRepairs.status, "pending");
  const rows = await db.select().from(graphRepairs).where(where).orderBy(desc(graphRepairs.createdAt)).limit(PAGE_SIZE).offset(offset);
  const totalRow = await db.select({ n: count() }).from(graphRepairs).where(where);
  return { rows, total: Number(totalRow[0]?.n ?? 0) };
}
