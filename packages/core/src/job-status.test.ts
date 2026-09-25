import { test } from "node:test";
import assert from "node:assert/strict";
import { assertTransition, canTransition, isTerminalStatus } from "./job-status.js";

test("terminal statuses", () => {
  assert.equal(isTerminalStatus("succeeded"), true);
  assert.equal(isTerminalStatus("queued"), false);
});

test("valid transitions", () => {
  assert.equal(canTransition("queued", "running"), true);
  assert.equal(canTransition("running", "succeeded"), true);
  assert.equal(canTransition("succeeded", "running"), false);
});

test("assertTransition throws on illegal move", () => {
  assert.throws(() => assertTransition("queued", "succeeded"));
});
