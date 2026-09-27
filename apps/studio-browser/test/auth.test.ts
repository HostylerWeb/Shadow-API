import assert from "node:assert/strict";
import test from "node:test";
import { mintStudioToken, verifyStudioToken } from "../src/auth.ts";

test("studio token round-trip", () => {
  process.env.STUDIO_BROWSER_SECRET = "test-secret";
  const token = mintStudioToken({ tenantId: "t1", userId: "u1" }, 60);
  const claims = verifyStudioToken(token);
  assert.equal(claims?.tenantId, "t1");
  assert.equal(claims?.userId, "u1");
});
