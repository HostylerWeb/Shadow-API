import { and, desc, eq, gte, sql } from "drizzle-orm";
import type { Db } from "@shadowapi/db";
import { decryptVault, encryptVault, liveCap } from "@shadowapi/core";
import { connectorVersions, jobs, tenants, usageEvents, vaultSessions } from "@shadowapi/db/schema";
import { createApiKey, loadPortalUser, usageCounts } from "./accounts.js";

export async function dashboardSecret(db: Db, userId: string): Promise<string> {
  const user = await loadPortalUser(db, userId);
  if (!user) throw new Error("Missing user");
  if (user.dashboardKey) return decryptVault(user.dashboardKey);
  const secret = await createApiKey(db, user.tenantId, "dashboard");
  const { portalUsers } = await import("@shadowapi/db/schema");
  await db.update(portalUsers).set({ dashboardKey: encryptVault(secret) }).where(eq(portalUsers.id, userId));
  return secret;
}

export async function tenantHome(db: Db, tenantId: string) {
  const tenant = (await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1))[0];
  const counts = await usageCounts(db, tenantId);
  const monthLive = await liveRunsThisMonth(db, tenantId);
  const plan = tenant?.plan ?? "developer";
  const recent = await db.select().from(jobs).where(eq(jobs.tenantId, tenantId)).orderBy(desc(jobs.createdAt)).limit(8);
  return { name: tenant?.name ?? "Tenant", plan, cap: liveCap(plan), counts, monthLive, recent };
}

export async function listTenantJobs(db: Db, tenantId: string, status = "") {
  const filters = [eq(jobs.tenantId, tenantId)];
  if (status) filters.push(eq(jobs.status, status as "queued"));
  return db.select().from(jobs).where(and(...filters)).orderBy(desc(jobs.createdAt)).limit(50);
}

export async function tenantJob(db: Db, tenantId: string, jobId: string) {
  const rows = await db.select().from(jobs).where(and(eq(jobs.id, jobId), eq(jobs.tenantId, tenantId))).limit(1);
  return rows[0] ?? null;
}

export async function listTenantSessions(db: Db, tenantId: string) {
  return db
    .select({
      connectorId: vaultSessions.connectorId,
      sessionId: vaultSessions.sessionId,
      sessionGeneration: vaultSessions.sessionGeneration,
      updatedAt: vaultSessions.updatedAt,
    })
    .from(vaultSessions)
    .where(eq(vaultSessions.tenantId, tenantId));
}

export async function listTenantConnectors(db: Db, tenantId: string) {
  const rows = await db.select().from(connectorVersions);
  return rows.filter((row) => {
    const manifest = row.manifest as { tenant_id?: string; graph?: unknown };
    return manifest.tenant_id === tenantId && manifest.graph;
  });
}

/** @deprecated Portal UI uses listTenantConnectors only */
export async function listVisibleConnectors(db: Db, tenantId: string) {
  return listTenantConnectors(db, tenantId);
}

export async function getTenantConnector(db: Db, tenantId: string, connectorId: string) {
  const row = (await db.select().from(connectorVersions).where(eq(connectorVersions.connectorId, connectorId)).limit(1))[0];
  if (!row) return null;
  const manifest = row.manifest as { tenant_id?: string; graph?: unknown };
  if (manifest.tenant_id !== tenantId || !manifest.graph) return null;
  return row;
}

export async function liveRunsThisMonth(db: Db, tenantId: string): Promise<number> {
  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(usageEvents)
    .where(and(eq(usageEvents.tenantId, tenantId), eq(usageEvents.kind, "live_run"), gte(usageEvents.createdAt, start)));
  return Number(rows[0]?.n ?? 0);
}
