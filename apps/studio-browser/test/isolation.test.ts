import assert from "node:assert/strict";
import test from "node:test";
import { tenantSessionCount } from "../src/sessions.ts";

test("tenant session count starts at zero", () => {
  assert.equal(tenantSessionCount("unknown-tenant"), 0);
});
