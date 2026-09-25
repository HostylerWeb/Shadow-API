import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { and, count, eq, isNull } from "drizzle-orm";
import type { Db } from "@shadowapi/db";
import { encryptVault } from "@shadowapi/core";
import { compileStudioGraph, loadCarrierFixture, loadGraph, replayStudioGraph, runCarrierFixture, runWarehouseFixture, loadWarehouseFixture, STUDIO_CONNECTOR_ID, STUDIO_GRAPH_VERSION } from "@shadowapi/graph-runner";
import type { NavigationPattern } from "@shadowapi/graph-runner";
import { apiKeys, auditLog, connectorVersions, graphRepairs, portalUsers, tenants, usageEvents, vaultSessions } from "@shadowapi/db/schema";

const manifestPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../connectors/carrier_x_pod/manifest.json",
);

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 32).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const next = scryptSync(password, salt, 32);
  const prev = Buffer.from(hash, "hex");
  return next.length === prev.length && timingSafeEqual(next, prev);
}

function hashKey(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

async function publishCarrier(db: Db): Promise<void> {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
    connector_id: string;
    connector_version: string;
    graph_version: string;
  };
  const existing = await db
    .select()
    .from(connectorVersions)
    .where(
      and(
        eq(connectorVersions.connectorId, manifest.connector_id),
        eq(connectorVersions.connectorVersion, manifest.connector_version),
      ),
    )
    .limit(1);
  if (existing[0]) return;
  await db.insert(connectorVersions).values({
    connectorId: manifest.connector_id,
    connectorVersion: manifest.connector_version,
    graphVersion: manifest.graph_version,
    manifest,
  });
}

export async function signUp(
  db: Db,
  email: string,
  password: string,
  role: "catalog" | "author" = "catalog",
): Promise<{ userId: string; tenantId: string }> {
  const [tenant] = await db.insert(tenants).values({ name: email }).returning();
  const authorUntil = role === "author" ? new Date(Date.now() + 24 * 60 * 60 * 1000) : null;
  const [user] = await db
    .insert(portalUsers)
    .values({ tenantId: tenant.id, email, passwordHash: hashPassword(password), role, authorUntil })
    .returning();
  await publishCarrier(db);
  return { userId: user.id, tenantId: tenant.id };
}

export function authorIsActive(role: string, authorUntil: Date | null, now = new Date()): boolean {
  if (role !== "author") return false;
  if (!authorUntil) return true;
  return authorUntil.getTime() > now.getTime();
}

export async function loadPortalUser(db: Db, userId: string) {
  const rows = await db.select().from(portalUsers).where(eq(portalUsers.id, userId)).limit(1);
  return rows[0] ?? null;
}

export async function signIn(
  db: Db,
  email: string,
  password: string,
): Promise<{ userId: string; tenantId: string } | null> {
  const rows = await db.select().from(portalUsers).where(eq(portalUsers.email, email)).limit(1);
  const user = rows[0];
  if (!user || !verifyPassword(password, user.passwordHash)) return null;
  return { userId: user.id, tenantId: user.tenantId };
}

export async function createApiKey(db: Db, tenantId: string, name: string): Promise<string> {
  const secret = `sk_live_${randomBytes(24).toString("hex")}`;
  await db.insert(apiKeys).values({
    tenantId,
    name,
    keyPrefix: secret.slice(0, 12),
    keyHash: hashKey(secret),
    scopes: ["jobs:write", "jobs:read"],
  });
  return secret;
}

export async function revokeApiKey(db: Db, tenantId: string, keyId: string): Promise<void> {
  await db
    .update(apiKeys)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiKeys.id, keyId), eq(apiKeys.tenantId, tenantId)));
}

export async function listApiKeys(db: Db, tenantId: string) {
  return db
    .select({
      id: apiKeys.id,
      name: apiKeys.name,
      keyPrefix: apiKeys.keyPrefix,
      revokedAt: apiKeys.revokedAt,
    })
    .from(apiKeys)
    .where(eq(apiKeys.tenantId, tenantId));
}

export async function usageCounts(db: Db, tenantId: string): Promise<{ cached_read: number; live_run: number }> {
  const rows = await db
    .select({ kind: usageEvents.kind, n: count() })
    .from(usageEvents)
    .where(eq(usageEvents.tenantId, tenantId))
    .groupBy(usageEvents.kind);
  const counts = { cached_read: 0, live_run: 0 };
  for (const row of rows) {
    if (row.kind === "cached_read" || row.kind === "live_run") counts[row.kind] = Number(row.n);
  }
  return counts;
}

export function loadCatalog() {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
    connector_id: string;
    inputs: Record<string, { type: string; required?: boolean }>;
    outputs: Record<string, { type?: string; enum?: string[]; signed?: boolean }>;
  };
  return {
    id: manifest.connector_id,
    summary: "Look up a Carrier X shipment and, when you ask for it, a proof-of-delivery file.",
    inputs: Object.entries(manifest.inputs).map(([name, field]) => ({
      name,
      type: field.type,
      required: Boolean(field.required),
      plain:
        name === "tracking_number"
          ? "The shipment number printed on the label."
          : name === "include_pod_document"
            ? "Ask for the proof-of-delivery file as well as the status."
            : "Postal code, required only when you want the file and you are not using a saved session.",
    })),
    outputs: Object.entries(manifest.outputs).map(([name, field]) => ({
      name,
      plain:
        name === "status"
          ? `Where the shipment is: ${(field.enum ?? []).join(", ")}.`
          : name === "document_url"
            ? "A short-lived link to the proof-of-delivery file. It expires in about 15 minutes."
            : "Name of the person who signed, when the site shows one.",
    })),
  };
}

export function quickstartText(base = "http://localhost:3000"): string {
  return [
    "Create an API key in this portal. Use it only from your server, not in a browser.",
    "",
    `curl -s -H "Authorization: Bearer $API_KEY" -H "Content-Type: application/json" \\`,
    `  -d '{"connector_id":"carrier_x_pod","inputs":{"tracking_number":"ABC"}}' \\`,
    `  ${base}/v1/jobs`,
    "",
    `curl -s -H "Authorization: Bearer $API_KEY" ${base}/v1/jobs/JOB_ID`,
    "",
    `curl -s -H "Authorization: Bearer $API_KEY" ${base}/v1/jobs/JOB_ID/result`,
    "",
    `OpenAPI: ${base}/v1/openapi.json`,
  ].join("\n");
}

export async function activeKeyCount(db: Db, tenantId: string): Promise<number> {
  const rows = await db
    .select({ n: count() })
    .from(apiKeys)
    .where(and(eq(apiKeys.tenantId, tenantId), isNull(apiKeys.revokedAt)));
  return Number(rows[0]?.n ?? 0);
}

export async function publishStudioConnector(
  db: Db,
  userId: string,
  tenantId: string,
  input: { url1: string; url2: string; pattern: NavigationPattern; inputName: string; outputName: string },
): Promise<{ ok: true; connectorId: string } | { ok: false; message: string }> {
  const user = await loadPortalUser(db, userId);
  if (!user || !authorIsActive(user.role, user.authorUntil)) {
    return { ok: false, message: "Studio is limited to authors" };
  }
  const graph = compileStudioGraph(input);
  const chosen = replayStudioGraph(graph, input.pattern);
  const other = replayStudioGraph(graph, input.pattern === "P2" ? "P3" : "P2");
  if (!chosen.ok || other.ok) {
    return { ok: false, message: "Staging replay failed" };
  }
  const connectorVersion = `1.0.0-${tenantId}`;
  const manifest = {
    connector_id: STUDIO_CONNECTOR_ID,
    connector_version: connectorVersion,
    graph_version: STUDIO_GRAPH_VERSION,
    tenant_id: tenantId,
    pattern: input.pattern,
    output_name: input.outputName,
    inputs: { [input.inputName]: { type: "string", required: true } },
    outputs: { [input.outputName]: { type: "string" } },
    graph,
  };
  await db.insert(connectorVersions).values({
    connectorId: STUDIO_CONNECTOR_ID,
    connectorVersion,
    graphVersion: STUDIO_GRAPH_VERSION,
    manifest,
  });
  await db.insert(vaultSessions).values({
    tenantId,
    connectorId: STUDIO_CONNECTOR_ID,
    sessionId: "studio",
    encryptedStorageState: encryptVault(JSON.stringify({ cookies: [], origins: [], tenantId })),
  });
  await db.insert(auditLog).values({
    tenantId,
    actorType: "portal_user",
    actorId: userId,
    action: "vault_onboarding",
    resourceType: "vault_session",
    resourceId: `${tenantId}:${STUDIO_CONNECTOR_ID}:studio`,
  });
  return { ok: true, connectorId: STUDIO_CONNECTOR_ID };
}

export async function listPendingRepairs(db: Db, tenantId: string) {
  return db.select().from(graphRepairs).where(and(eq(graphRepairs.tenantId, tenantId), eq(graphRepairs.status, "pending")));
}

export async function approveRepair(
  db: Db,
  userId: string,
  repairId: string,
): Promise<{ ok: true; graphVersion: string; connectorVersion: string } | { ok: false; message: string }> {
  const user = await loadPortalUser(db, userId);
  if (!user || !authorIsActive(user.role, user.authorUntil)) {
    return { ok: false, message: "Studio is limited to authors" };
  }
  const repairs = await db.select().from(graphRepairs).where(eq(graphRepairs.id, repairId)).limit(1);
  const repair = repairs[0];
  if (!repair || repair.tenantId !== user.tenantId || repair.status !== "pending") {
    return { ok: false, message: "Repair not found" };
  }
  const published = await db
    .select()
    .from(connectorVersions)
    .where(
      and(eq(connectorVersions.connectorId, repair.connectorId), eq(connectorVersions.connectorVersion, repair.connectorVersion)),
    )
    .limit(1);
  const row = published[0];
  if (!row) return { ok: false, message: "Published connector not found" };
  let replayOk = false;
  if (repair.connectorId === "warehouse_x_receipt") {
    replayOk = runWarehouseFixture(loadWarehouseFixture("found")).jobStatus === "succeeded";
  } else if (repair.connectorId === STUDIO_CONNECTOR_ID) {
    const graph = (row.manifest as { graph?: unknown; pattern?: "P1" | "P2" | "P3" }).graph;
    const pattern = (row.manifest as { pattern?: "P1" | "P2" | "P3" }).pattern ?? "P2";
    replayOk = Boolean(graph && replayStudioGraph(loadGraph(graph), pattern).ok);
  } else {
    replayOk = runCarrierFixture(loadCarrierFixture("in_transit")).jobStatus === "succeeded";
  }
  if (!replayOk) return { ok: false, message: "Staging replay failed" };
  const diff = repair.proposedDiff as { graph_version: string };
  const manifest = { ...(row.manifest as Record<string, unknown>), graph_version: diff.graph_version };
  await db
    .update(connectorVersions)
    .set({ graphVersion: diff.graph_version, manifest })
    .where(eq(connectorVersions.id, row.id));
  await db.update(graphRepairs).set({ status: "approved" }).where(eq(graphRepairs.id, repair.id));
  return { ok: true, graphVersion: diff.graph_version, connectorVersion: row.connectorVersion };
}
