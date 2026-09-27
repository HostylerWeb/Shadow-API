import type { Db } from "@shadowapi/db";
import { connectorVersions } from "@shadowapi/db/schema";
import { sameTeachSiteHost } from "./rewrite";

function hostFromUrl(raw: string): string | null {
  try {
    return new URL(raw).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function envAllowlist(): Set<string> {
  const raw = process.env.TEACH_BROWSE_ALLOWLIST ?? "";
  return new Set(
    raw
      .split(",")
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean),
  );
}

function hostAllowed(host: string, allowed: string): boolean {
  return sameTeachSiteHost(allowed, host);
}

export async function teachBrowseHostAllowed(db: Db, tenantId: string, hostname: string, sessionHosts: string[]): Promise<boolean> {
  const host = hostname.toLowerCase();
  const env = envAllowlist();
  for (const allowed of env) {
    if (hostAllowed(host, allowed)) return true;
  }
  for (const h of sessionHosts) {
    if (hostAllowed(host, h)) return true;
  }
  const rows = await db.select().from(connectorVersions);
  for (const row of rows) {
    const manifest = row.manifest as { tenant_id?: string; start_url?: string; result_url?: string };
    if (manifest.tenant_id !== tenantId) continue;
    for (const url of [manifest.start_url, manifest.result_url]) {
      if (!url) continue;
      const h = hostFromUrl(url);
      if (h && hostAllowed(host, h)) return true;
    }
  }
  return false;
}
