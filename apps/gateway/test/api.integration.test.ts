import { readFileSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { createDb } from "@shadowapi/db";
import { apiKeys, jobs, tenants } from "@shadowapi/db/schema";
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

    test("rejects raw cookies", async () => {
      const { secret } = await mintApiKey(db);
      const res = await app.inject({
        method: "POST",
        url: "/v1/jobs",
        headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
        payload: { connector_id: "carrier_x_pod", cookies: [{ name: "a", value: "b" }], inputs: { tracking_number: "A" } },
      });
      assert.equal(res.statusCode, 400);
      assert.equal((res.json() as { failure: { code: string } }).failure.code, "VALIDATION_ERROR");
    });

    test("cached carrier read does not enqueue", async () => {
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

    test("cached carrier status does not enqueue", async () => {
      const { secret } = await mintApiKey(db);
      const inputs = { tracking_number: "POD1", include_pod_document: false };
      const { carrierCacheKey } = await import("@shadowapi/graph-runner");
      const key = carrierCacheKey(inputs);
      const cache = new Map<string, string>([[key, JSON.stringify({ outputs: { status: "IN_TRANSIT" } })]]);
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
        payload: { connector_id: "carrier_x_pod", run_mode: "cached", inputs },
      });
      assert.equal(res.statusCode, 200);
      assert.equal(enqueueCalls.length, before);
      assert.equal((res.json() as { status: string }).status, "succeeded");
    });

    test("serves OpenAPI document", async () => {
      const res = await app.inject({ method: "GET", url: "/v1/openapi.json" });
      assert.equal(res.statusCode, 200);
      const spec = res.json() as { openapi: string; paths: Record<string, unknown> };
      assert.ok(spec.openapi.startsWith("3."));
      assert.ok(spec.paths["/v1/jobs"]);
    });

    test("mcp client completes the same carrier flow as curl", async () => {
      const { secret } = await mintApiKey(db);
      const inputs = { tracking_number: "MCP1", include_pod_document: false };
      const { carrierCacheKey } = await import("@shadowapi/graph-runner");
      const key = carrierCacheKey(inputs);
      const cache = new Map<string, string>([[key, JSON.stringify({ outputs: { status: "IN_TRANSIT" } })]]);
      let enqueues = 0;
      const mcpApp = buildGatewayApp(db, {
        enqueue: async () => {
          enqueues += 1;
        },
        cacheGet: async (lookup) => cache.get(lookup) ?? null,
      });
      await mcpApp.ready();
      const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
      const { InMemoryTransport } = await import("@modelcontextprotocol/sdk/inMemory.js");
      const { createShadowMcp } = await import("../src/mcp.js");
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      const server = createShadowMcp(mcpApp, `Bearer ${secret}`);
      await server.connect(serverTransport);
      const client = new Client({ name: "shadow-test", version: "0.0.0" });
      await client.connect(clientTransport);

      const textOf = (result: { content: Array<{ type: string; text?: string }> }) => {
        const block = result.content.find((item) => item.type === "text");
        return JSON.parse(block?.text ?? "{}") as Record<string, unknown>;
      };

      const started = textOf(
        (await client.callTool({
          name: "shadow_start_workflow",
          arguments: {
            connector_id: "carrier_x_pod",
            inputs,
            run_mode: "cached",
            idempotency_key: "mcp-1",
          },
        })) as { content: Array<{ type: string; text?: string }> },
      );
      const jobId = String(started.job_id);
      const polled = textOf(
        (await client.callTool({
          name: "shadow_get_job_status",
          arguments: { job_id: jobId },
        })) as { content: Array<{ type: string; text?: string }> },
      );
      assert.equal(polled.result_ready, true);
      const result = textOf(
        (await client.callTool({
          name: "shadow_get_job_result",
          arguments: { job_id: jobId },
        })) as { content: Array<{ type: string; text?: string }> },
      );
      assert.equal((result.outputs as { status: string }).status, "IN_TRANSIT");

      const again = textOf(
        (await client.callTool({
          name: "shadow_start_workflow",
          arguments: {
            connector_id: "carrier_x_pod",
            inputs,
            run_mode: "cached",
            idempotency_key: "mcp-1",
          },
        })) as { content: Array<{ type: string; text?: string }> },
      );
      assert.equal(again.job_id, jobId);

      const before = enqueues;
      const rejected = textOf(
        (await client.callTool({
          name: "shadow_start_workflow",
          arguments: { connector_id: "carrier_x_pod", inputs, invented: true },
        })) as { content: Array<{ type: string; text?: string }> },
      );
      assert.equal((rejected.failure as { code: string }).code, "VALIDATION_ERROR");
      assert.equal(enqueues, before);

      await client.close();
      await server.close();
      await mcpApp.close();
    });

    test("live quota is rejected before a worker starts and cached reads still succeed", async () => {
      const { secret, tenantId } = await mintApiKey(db);
      const { usageEvents } = await import("@shadowapi/db/schema");
      const { eq } = await import("drizzle-orm");
      const { carrierCacheKey } = await import("@shadowapi/graph-runner");
      await db.update(tenants).set({ plan: "developer" }).where(eq(tenants.id, tenantId));
      for (let i = 0; i < 10; i += 1) {
        await db.insert(usageEvents).values({ tenantId, connectorId: "carrier_x_pod", kind: "live_run" });
      }
      let enqueues = 0;
      const inputs = { tracking_number: "QUOTA1", include_pod_document: false };
      const cache = new Map<string, string>([[carrierCacheKey(inputs), JSON.stringify({ outputs: { status: "IN_TRANSIT" } })]]);
      const quotaApp = buildGatewayApp(db, {
        enqueue: async () => {
          enqueues += 1;
        },
        cacheGet: async (key) => cache.get(key) ?? null,
      });
      await quotaApp.ready();
      const live = await quotaApp.inject({
        method: "POST",
        url: "/v1/jobs",
        headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
        payload: { connector_id: "carrier_x_pod", inputs: { tracking_number: "ABC" } },
      });
      assert.equal(live.statusCode, 429);
      assert.equal((live.json() as { failure: { code: string } }).failure.code, "RATE_LIMITED");
      assert.equal(enqueues, 0);
      const cached = await quotaApp.inject({
        method: "POST",
        url: "/v1/jobs",
        headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
        payload: { connector_id: "carrier_x_pod", run_mode: "cached", inputs },
      });
      assert.equal(cached.statusCode, 200);
      assert.equal(enqueues, 0);
      await quotaApp.close();
    });

    test("redis rate limit returns RATE_LIMITED", async () => {
      const redisUrl = process.env.REDIS_URL;
      if (!redisUrl) return;
      const { default: Redis } = await import("ioredis");
      const redis = new Redis(redisUrl, { maxRetriesPerRequest: null });
      const { secret } = await mintApiKey(db);
      let enqueues = 0;
      const limited = buildGatewayApp(db, {
        enqueue: async () => {
          enqueues += 1;
        },
        redis,
      });
      await limited.ready();
      let lastStatus = 0;
      for (let i = 0; i < 61; i += 1) {
        const res = await limited.inject({
          method: "POST",
          url: "/v1/jobs",
          headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
          payload: { connector_id: "rate_connector" },
        });
        lastStatus = res.statusCode;
        if (res.statusCode === 429) {
          assert.equal((res.json() as { failure: { code: string } }).failure.code, "RATE_LIMITED");
          break;
        }
      }
      assert.equal(lastStatus, 429);
      assert.equal(enqueues, 60);
      await limited.close();
      await redis.quit();
    });

    test("local billing gateway sets the tenant plan", async () => {
      const { secret, tenantId } = await mintApiKey(db);
      const { eq } = await import("drizzle-orm");
      const res = await app.inject({
        method: "POST",
        url: "/v1/billing/plan",
        headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
        payload: { plan: "agency" },
      });
      assert.equal(res.statusCode, 200);
      assert.equal((res.json() as { plan: string }).plan, "agency");
      const row = (await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1))[0];
      assert.equal(row.plan, "agency");
    });

    test("gateway package has no camoufox and result is a signed URL", async () => {
      const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
        dependencies: Record<string, string>;
      };
      assert.equal(pkg.dependencies["camoufox-js"], undefined);
      const { secret, tenantId } = await mintApiKey(db);
      const [job] = await db
        .insert(jobs)
        .values({
          tenantId,
          connectorId: "carrier_x_pod",
          status: "succeeded",
          outputs: { document_blob_id: "pods/t/j.bin", status: "DELIVERED" },
        })
        .returning();
      const res = await app.inject({
        method: "GET",
        url: `/v1/jobs/${job.id}/result`,
        headers: { authorization: `Bearer ${secret}` },
      });
      assert.equal(res.statusCode, 200);
      const body = res.json() as { outputs: { document_url: string } };
      assert.equal(typeof body.outputs.document_url, "string");
      assert.equal(body.outputs.document_url.startsWith("http"), true);
      assert.equal(res.headers["content-type"]?.includes("application/json"), true);
    });

    test("status polls stay under 200ms p95 while a tenant job is running", async () => {
      const { secret, tenantId } = await mintApiKey(db);
      await db.insert(jobs).values({ tenantId, connectorId: "carrier_x_pod", status: "running" });
      const [polled] = await db
        .insert(jobs)
        .values({ tenantId, connectorId: "carrier_x_pod", status: "queued" })
        .returning();
      const samples: number[] = [];
      for (let i = 0; i < 40; i += 1) {
        const started = Date.now();
        const res = await app.inject({
          method: "GET",
          url: `/v1/jobs/${polled.id}`,
          headers: { authorization: `Bearer ${secret}` },
        });
        samples.push(Date.now() - started);
        assert.equal(res.statusCode, 200);
      }
      samples.sort((a, b) => a - b);
      const p95 = samples[Math.floor(samples.length * 0.95)];
      assert.equal(p95 < 200, true, `p95 poll was ${p95}ms`);
    });

    test("client URL outside target_domains is rejected", async () => {
      const { secret } = await mintApiKey(db);
      const res = await app.inject({
        method: "POST",
        url: "/v1/jobs",
        headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
        payload: {
          connector_id: "carrier_x_pod",
          inputs: { tracking_number: "ABC", destination_zip: "https://evil.example/hook" },
        },
      });
      assert.equal(res.statusCode, 400);
      assert.equal((res.json() as { failure: { code: string } }).failure.code, "VALIDATION_ERROR");
    });
  });
}
