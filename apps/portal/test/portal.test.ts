import { randomBytes } from "node:crypto";
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { createDb } from "@shadowapi/db";
import { buildGatewayApp } from "../../gateway/src/app.ts";
import { createApiKey, quickstartText, signUp, publishUserEndpoint, approveRepair } from "../src/accounts.ts";
import { connectorVersions, graphRepairs, jobs, portalUsers } from "@shadowapi/db/schema";
import { eq } from "drizzle-orm";
import { listTenantJobs } from "../src/dashboard.ts";
import { adminTenants, requireAdmin } from "../src/admin.ts";

const databaseUrl = process.env.DATABASE_URL;
process.env.VAULT_DATA_KEY ??= Buffer.alloc(32, 0).toString("base64");

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

test("catalog users can publish a taught endpoint and authors can approve repairs", async (t) => {
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
  const { publishUserEndpoint } = await import("../src/accounts.ts");
  const published = await publishUserEndpoint(handle.db, catalog.userId, catalog.tenantId, {
    title: "Support tracking",
    description: "Parcel lookup for support",
    url1: "https://staging.local/tracking",
    url2: "https://staging.local/tracking?tracking=123",
    pattern: "P2",
    inputName: "tracking_number",
    outputName: "status",
  });
  assert.equal(published.ok, true);
  if (!published.ok) return;
  const rows = await handle.db.select().from(connectorVersions).where(eq(connectorVersions.connectorId, published.connectorId));
  assert.equal(rows.length, 1);

  const author = await signUp(handle.db, `auth-${randomBytes(4).toString("hex")}@example.com`, "password-123", "author");
  const authorPub = await publishUserEndpoint(handle.db, author.userId, author.tenantId, {
    title: "Author flow",
    description: "Author endpoint",
    url1: "https://staging.local/tracking",
    url2: "https://staging.local/tracking?tracking=123",
    pattern: "P2",
    inputName: "tracking_number",
    outputName: "status",
  });
  assert.equal(authorPub.ok, true);
  if (!authorPub.ok) return;
  const version = "1.0.0";
  const [repair] = await handle.db
    .insert(graphRepairs)
    .values({
      tenantId: author.tenantId,
      connectorId: authorPub.connectorId,
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
  }
});

test("job lists stay on the tenant and catalog users are not admins", async (t) => {
  if (!databaseUrl) {
    t.skip("DATABASE_URL is required");
    return;
  }
  const handle = createDb(databaseUrl);
  after(async () => {
    await handle.close();
  });
  const emailA = `dash-a-${randomBytes(3).toString("hex")}@example.com`;
  const emailB = `dash-b-${randomBytes(3).toString("hex")}@example.com`;
  const a = await signUp(handle.db, emailA, "password-123");
  const b = await signUp(handle.db, emailB, "password-123");
  await handle.db.insert(jobs).values({ tenantId: a.tenantId, connectorId: "carrier_x_pod", status: "queued" });
  await handle.db.insert(jobs).values({ tenantId: b.tenantId, connectorId: "warehouse_x_receipt", status: "succeeded" });
  const mine = await listTenantJobs(handle.db, a.tenantId);
  assert.equal(mine.every((job) => job.tenantId === a.tenantId), true);
  assert.equal(await requireAdmin(handle.db, a.userId), null);
  await handle.db.update(portalUsers).set({ role: "admin" }).where(eq(portalUsers.id, b.userId));
  const admin = await requireAdmin(handle.db, b.userId);
  assert.equal(admin?.role, "admin");
  const tenants = await adminTenants(handle.db, 1, emailA.split("@")[0] ?? emailA);
  assert.equal(tenants.rows.some((row) => row.id === a.tenantId), true);
});
