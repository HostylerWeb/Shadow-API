import { test } from "node:test";
import assert from "node:assert/strict";
import { FAILURE_CODES, isFailureCode } from "./failure-codes.js";

test("failure codes include spec set", () => {
  assert.ok(isFailureCode("VALIDATION_ERROR"));
  assert.ok(isFailureCode("GRAPH_STEP_FAILED"));
  assert.equal(isFailureCode("NOT_A_CODE"), false);
  assert.equal(FAILURE_CODES.length, 9);
});
