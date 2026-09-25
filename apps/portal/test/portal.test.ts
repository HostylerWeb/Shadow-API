import { randomBytes } from "node:crypto";
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { createDb } from "@shadowapi/db";
import { buildGatewayApp } from "../../gateway/src/app.ts";
import { createApiKey, quickstartText, signUp, loadPortalUser, authorIsActive, publishStudioConnector, approveRepair } from "../src/accounts.ts";
import { connectorVersions, auditLog, vaultSessions, graphRepairs } from "@shadowapi/db/schema";
import { eq } from "drizzle-orm";

const databaseUrl = process.env.DATABASE_URL;

test("portal key calls POST /v1/jobs and quickstart documents the flow", async (t) => {
  if (!databaseUrl) {
    t.skip("DATABASE_URL is required");
    return;
  }
  process.env.PORTAL_SESSION_SECRET ??= "test-portal-secret";
  const handle = createDb(databaseUrl);
  after(async () => {
    await handle.close();
  });
  const email = `portal-${randomBytes(4).toString("hex")}@example.com`;
  const user = await signUp(handle.db, email, "password-123");
  const secret = await createApiKey(handle.db, user.tenantId, "server");
  const app = buildGatewayApp(handle.db, { enqueue: async () => {} });
  const response = await app.inject({
    method: "POST",
    url: "/v1/jobs",
    headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
    payload: { connector_id: "carrier_x_pod", inputs: { tracking_number: "ABC" } },
  });
  assert.equal(response.statusCode, 202);
  const docs = quickstartText();
  assert.match(docs, /POST|\/v1\/jobs/);
  assert.match(docs, /\/v1\/jobs\/JOB_ID/);
  assert.match(docs, /\/v1\/jobs\/JOB_ID\/result/);
  await app.close();
});

test("catalog users cannot publish and authors publish a two-URL P2 flow", async (t) => {
  if (!databaseUrl) {
    t.skip("DATABASE_URL is required");
    return;
  }
  process.env.PORTAL_SESSION_SECRET ??= "test-portal-secret";
  process.env.VAULT_DATA_KEY ??= Buffer.alloc(32, 0).toString("base64");
  const handle = createDb(databaseUrl);
  after(async () => {
    await handle.close();
  });
  const catalog = await signUp(handle.db, `cat-${randomBytes(4).toString("hex")}@example.com`, "password-123", "catalog");
  const catalogUser = await loadPortalUser(handle.db, catalog.userId);
  assert.equal(authorIsActive(catalogUser!.role, catalogUser!.authorUntil), false);
  const denied = await publishStudioConnector(handle.db, catalog.userId, catalog.tenantId, {
    url1: "https://staging.local/tracking",
    url2: "https://staging.local/tracking?tracking=123",
    pattern: "P2",
    inputName: "tracking_number",
    outputName: "status",
  });
  assert.equal(denied.ok, false);

  const author = await signUp(handle.db, `auth-${randomBytes(4).toString("hex")}@example.com`, "password-123", "author");
  const published = await publishStudioConnector(handle.db, author.userId, author.tenantId, {
    url1: "https://staging.local/tracking",
    url2: "https://staging.local/tracking?tracking=123",
    pattern: "P2",
    inputName: "tracking_number",
    outputName: "status",
  });
  assert.equal(published.ok, true);
  const rows = await handle.db.select().from(connectorVersions).where(eq(connectorVersions.connectorId, "studio_tracking"));
  assert.equal(rows.some((row) => (row.manifest as { tenant_id?: string }).tenant_id === author.tenantId), true);
  const audits = await handle.db.select().from(auditLog).where(eq(auditLog.tenantId, author.tenantId));
  assert.equal(audits.some((row) => row.action === "vault_onboarding"), true);
  const vaults = await handle.db.select().from(vaultSessions).where(eq(vaultSessions.tenantId, author.tenantId));
  assert.equal(vaults.length, 1);
  assert.equal(vaults[0].connectorId, "studio_tracking");

  const version = `1.0.0-${author.tenantId}`;
  const [repair] = await handle.db
    .insert(graphRepairs)
    .values({
      tenantId: author.tenantId,
      connectorId: "studio_tracking",
      connectorVersion: version,
      lastGoodGraphVersion: "v1.0.0-g1",
      accessibilitySnapshot: "role=status name=shipment",
      proposedDiff: { selector: "status", from: "missing", to: "role=status name=shipment", connector_version: version, graph_version: "v1.0.0-g2" },
      status: "pending",
    })
    .returning();
  const approved = await approveRepair(handle.db, author.userId, repair.id);
  assert.equal(approved.ok, true);
  if (approved.ok) {
    assert.equal(approved.graphVersion, "v1.0.0-g2");
    assert.equal(approved.connectorVersion, version);
  }
  const updated = (
    await handle.db.select().from(connectorVersions).where(eq(connectorVersions.connectorVersion, version)).limit(1)
  )[0];
  assert.equal(updated.graphVersion, "v1.0.0-g2");
  assert.equal(updated.connectorVersion, version);
});
