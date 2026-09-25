import { test } from "node:test";
import assert from "node:assert/strict";
import { idempotencyExpiresAt, resolveIdempotentJob } from "./idempotency.js";

test("resolveIdempotentJob returns job inside TTL", () => {
  const now = new Date("2026-01-01T00:00:00Z");
  const jobId = resolveIdempotentJob(
    [
      {
        tenantId: "t1",
        idempotencyKey: "k1",
        existingJobId: "job-abc",
        expiresAt: new Date("2026-01-02T00:00:00Z"),
      },
    ],
    "t1",
    "k1",
    now,
  );
  assert.equal(jobId, "job-abc");
});

test("resolveIdempotentJob ignores expired or other tenant", () => {
  const now = new Date("2026-01-03T00:00:00Z");
  assert.equal(
    resolveIdempotentJob(
      [
        {
          tenantId: "t1",
          idempotencyKey: "k1",
          existingJobId: "job-abc",
          expiresAt: new Date("2026-01-02T00:00:00Z"),
        },
      ],
      "t1",
      "k1",
      now,
    ),
    null,
  );
  assert.equal(resolveIdempotentJob([], "t1", undefined, now), null);
});

test("idempotencyExpiresAt adds TTL", () => {
  const now = new Date("2026-01-01T00:00:00Z");
  const exp = idempotencyExpiresAt(now, 60_000);
  assert.equal(exp.toISOString(), "2026-01-01T00:01:00.000Z");
});
