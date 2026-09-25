import test from "node:test";
import assert from "node:assert/strict";
import { redactPii } from "./repair.js";
import { runWarehouseFixture, loadWarehouseFixture } from "./warehouse.js";

test("redactPii hides destination_zip", () => {
  const logged = JSON.stringify(redactPii(["destination_zip", "signed_by"], { destination_zip: "10001", tracking_number: "ABC" }));
  assert.equal(logged.includes("10001"), false);
  assert.equal(logged.includes("[redacted]"), true);
  assert.equal(logged.includes("ABC"), true);
});

test("warehouse found fixture returns RECEIVED", () => {
  const run = runWarehouseFixture(loadWarehouseFixture("found"));
  assert.equal(run.jobStatus, "succeeded");
  assert.equal(run.outputs.status, "RECEIVED");
  const missing = runWarehouseFixture(loadWarehouseFixture("not_found"));
  assert.equal(missing.outputs.status, "NOT_FOUND");
});
