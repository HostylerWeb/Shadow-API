import { test } from "node:test";
import assert from "node:assert/strict";
import { assertSessionBelongsToTenant, TenantIsolationError } from "./tenant.js";

test("assertSessionBelongsToTenant passes for same tenant", () => {
  assertSessionBelongsToTenant("t1", "t1");
});

test("assertSessionBelongsToTenant throws across tenants", () => {
  assert.throws(
    () => assertSessionBelongsToTenant("t1", "t2"),
    TenantIsolationError,
  );
});
