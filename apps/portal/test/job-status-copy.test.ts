import test from "node:test";
import assert from "node:assert/strict";
import { isTerminalStatus, jobStatusView } from "../app/jobs/job-status-copy.js";

test("running status explains browser work", () => {
  const v = jobStatusView("running");
  assert.match(v.headline, /Running/i);
  assert.match(v.detail, /Camoufox/i);
  assert.ok(v.steps.some((s) => s.state === "active"));
});

test("queued status mentions queue", () => {
  const v = jobStatusView("queued");
  assert.match(v.detail, /queue/i);
});

test("isTerminalStatus", () => {
  assert.equal(isTerminalStatus("running"), false);
  assert.equal(isTerminalStatus("succeeded"), true);
});
