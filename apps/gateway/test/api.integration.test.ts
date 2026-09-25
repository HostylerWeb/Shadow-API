import { createHash, randomBytes } from "node:crypto";
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { createDb } from "@shadowapi/db";
import { apiKeys, tenants } from "@shadowapi/db/schema";
import { buildGatewayApp } from "../src/app.js";

const databaseUrl = process.env.DATABASE_URL;

function hashKey(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

async function mintApiKey(db: ReturnType<typeof createDb>["db"]) {
  const [tenant] = await db.insert(tenants).values({ name: `test-${randomBytes(4).toString("hex")}` }).returning();
  const secret = `sk_test_${randomBytes(16).toString("hex")}`;
  await db.insert(apiKeys).values({
    tenantId: tenant.id,
    name: "integration",
    keyPrefix: secret.slice(0, 12),
    keyHash: hashKey(secret),
    scopes: ["jobs:write", "jobs:read"],
  });
  return { tenantId: tenant.id, secret };
}

if (!databaseUrl) {
  describe("gateway API integration", () => {
    test("skipped — set DATABASE_URL to run", { skip: true }, () => {});
  });
} else {
  describe("gateway API integration", () => {
    const { db, close } = createDb(databaseUrl);
    let app: ReturnType<typeof buildGatewayApp>;
    let enqueueCalls: string[] = [];

    before(async () => {
      enqueueCalls = [];
      app = buildGatewayApp(db, {
        enqueue: async (jobId) => {
          enqueueCalls.push(jobId);
        },
      });
      await app.ready();
    });

    after(async () => {
      await app.close();
      await close();
    });

    test("validation error does not enqueue", async () => {
      const { secret } = await mintApiKey(db);
      const beforeCount = enqueueCalls.length;
      const res = await app.inject({
        method: "POST",
        url: "/v1/jobs",
        headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
        payload: { inputs: {} },
      });
      assert.equal(res.statusCode, 400);
      assert.equal(enqueueCalls.length, beforeCount);
      const body = res.json() as { failure: { code: string } };
      assert.equal(body.failure.code, "VALIDATION_ERROR");
    });

    test("tenant isolation on GET /v1/jobs/:id", async () => {
      const a = await mintApiKey(db);
      const b = await mintApiKey(db);

      const created = await app.inject({
        method: "POST",
        url: "/v1/jobs",
        headers: { authorization: `Bearer ${a.secret}`, "content-type": "application/json" },
        payload: { connector_id: "isolation_test" },
      });
      assert.equal(created.statusCode, 202);
      const { job_id } = created.json() as { job_id: string };

      const peek = await app.inject({
        method: "GET",
        url: `/v1/jobs/${job_id}`,
        headers: { authorization: `Bearer ${b.secret}` },
      });
      assert.equal(peek.statusCode, 404);
    });

    test("idempotent POST returns same job_id", async () => {
      const { secret } = await mintApiKey(db);
      const key = `idem-${randomBytes(8).toString("hex")}`;
      const headers = { authorization: `Bearer ${secret}`, "content-type": "application/json" };

      const first = await app.inject({
        method: "POST",
        url: "/v1/jobs",
        headers,
        payload: { connector_id: "idem_test", idempotency_key: key },
      });
      const second = await app.inject({
        method: "POST",
        url: "/v1/jobs",
        headers,
        payload: { connector_id: "idem_test", idempotency_key: key },
      });

      assert.equal(first.statusCode, 202);
      assert.equal(second.statusCode, 200);
      const a = first.json() as { job_id: string };
      const b = second.json() as { job_id: string };
      assert.equal(a.job_id, b.job_id);
      assert.equal(enqueueCalls.filter((id) => id === a.job_id).length, 1);
    });

    test("poll returns queued and result is not ready until success", async () => {
      const { secret } = await mintApiKey(db);
      const headers = { authorization: `Bearer ${secret}`, "content-type": "application/json" };
      const created = await app.inject({
        method: "POST",
        url: "/v1/jobs",
        headers,
        payload: { connector_id: "poll_test" },
      });
      assert.equal(created.statusCode, 202);
      const { job_id } = created.json() as { job_id: string; status: string };
      assert.equal((created.json() as { status: string }).status, "queued");

      const poll = await app.inject({
        method: "GET",
        url: `/v1/jobs/${job_id}`,
        headers: { authorization: `Bearer ${secret}` },
      });
      assert.equal(poll.statusCode, 200);
      assert.equal((poll.json() as { status: string }).status, "queued");

      const result = await app.inject({
        method: "GET",
        url: `/v1/jobs/${job_id}/result`,
        headers: { authorization: `Bearer ${secret}` },
      });
      assert.equal(result.statusCode, 409);
      assert.equal((result.json() as { failure: { code: string } }).failure.code, "VALIDATION_ERROR");
    });

    test("DELETE cancels a queued job", async () => {
      const { secret } = await mintApiKey(db);
      const created = await app.inject({
        method: "POST",
        url: "/v1/jobs",
        headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
        payload: { connector_id: "cancel_test" },
      });
      const { job_id } = created.json() as { job_id: string };
      const cancelled = await app.inject({
        method: "DELETE",
        url: `/v1/jobs/${job_id}`,
        headers: { authorization: `Bearer ${secret}` },
      });
      assert.equal(cancelled.statusCode, 200);
      assert.equal((cancelled.json() as { status: string }).status, "cancelled");
    });

    test("carrier POD without zip or session does not enqueue", async () => {
      const { secret } = await mintApiKey(db);
      const before = enqueueCalls.length;
      const res = await app.inject({
        method: "POST",
        url: "/v1/jobs",
        headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
        payload: {
          connector_id: "carrier_x_pod",
          inputs: { tracking_number: "ABC", include_pod_document: true },
        },
      });
      assert.equal(res.statusCode, 400);
      assert.equal(enqueueCalls.length, before);
    });

    test("cached hit does not enqueue", async () => {
      const { secret } = await mintApiKey(db);
      const inputs = { tracking_number: "CACHE1" };
      const { stubCacheKey } = await import("@shadowapi/core");
      const key = stubCacheKey("cache_connector", inputs);
      const cache = new Map<string, string>([[key, JSON.stringify({ outputs: { stub: true, from: "cache" } })]]);
      await app.close();
      app = buildGatewayApp(db, {
        enqueue: async (jobId) => {
          enqueueCalls.push(jobId);
        },
        cacheGet: async (k) => cache.get(k) ?? null,
      });
      await app.ready();
      const before = enqueueCalls.length;
      const res = await app.inject({
        method: "POST",
        url: "/v1/jobs",
        headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
        payload: { connector_id: "cache_connector", run_mode: "cached", inputs },
      });
      assert.equal(res.statusCode, 200);
      assert.equal((res.json() as { status: string }).status, "succeeded");
      assert.equal(enqueueCalls.length, before);
    });

    test("serves OpenAPI document", async () => {
      const res = await app.inject({ method: "GET", url: "/v1/openapi.json" });
      assert.equal(res.statusCode, 200);
      const spec = res.json() as { openapi: string; paths: Record<string, unknown> };
      assert.ok(spec.openapi.startsWith("3."));
      assert.ok(spec.paths["/v1/jobs"]);
    });
  });
}
