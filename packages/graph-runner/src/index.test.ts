import { test } from "node:test";
import assert from "node:assert/strict";
import { GRAPH_RUNNER_VERSION } from "./index.js";

test("graph runner package loads", () => {
  assert.equal(GRAPH_RUNNER_VERSION, "0.2.0");
});
