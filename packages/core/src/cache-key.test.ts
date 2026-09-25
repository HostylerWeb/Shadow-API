import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCacheKey } from "./cache-key.js";

test("cache key is stable for same inputs", () => {
  const a = buildCacheKey({
    connectorId: "carrier_x_pod",
    keyFields: ["tracking_number", "include_pod_document", "session_generation"],
    inputs: { tracking_number: "ABC", include_pod_document: true },
    sessionGeneration: 2,
  });
  const b = buildCacheKey({
    connectorId: "carrier_x_pod",
    keyFields: ["tracking_number", "include_pod_document", "session_generation"],
    inputs: { tracking_number: "ABC", include_pod_document: true },
    sessionGeneration: 2,
  });
  assert.equal(a, b);
});

test("session_generation busts cache", () => {
  const a = buildCacheKey({
    connectorId: "carrier_x_pod",
    keyFields: ["tracking_number", "session_generation"],
    inputs: { tracking_number: "ABC" },
    sessionGeneration: 1,
  });
  const b = buildCacheKey({
    connectorId: "carrier_x_pod",
    keyFields: ["tracking_number", "session_generation"],
    inputs: { tracking_number: "ABC" },
    sessionGeneration: 2,
  });
  assert.notEqual(a, b);
});
