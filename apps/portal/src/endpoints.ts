import type { Db } from "@shadowapi/db";
import { connectorVersions } from "@shadowapi/db/schema";
import { eq } from "drizzle-orm";

export function endpointTitle(connectorId: string, title?: string): string {
  if (title) return title;
  if (connectorId.startsWith("custom_")) return connectorId.replace(/^custom_/, "").replace(/_/g, " ");
  return connectorId;
}

export async function endpointTitleForTenant(db: Db, tenantId: string, connectorId: string): Promise<string> {
  const rows = await db.select().from(connectorVersions).where(eq(connectorVersions.connectorId, connectorId)).limit(1);
  const manifest = rows[0]?.manifest as { title?: string; tenant_id?: string } | undefined;
  if (manifest?.tenant_id === tenantId && manifest.title) return manifest.title;
  return endpointTitle(connectorId);
}
