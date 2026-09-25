import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";
import { detectNavigationPattern, loadGraph, runGraph, type FixtureReplay } from "./index.js";

const fixtureDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../fixtures");

function graph() {
  return loadGraph(JSON.parse(readFileSync(path.join(fixtureDir, "sample.graph.json"), "utf8")));
}

function replay(over: Partial<FixtureReplay>): FixtureReplay {
  return {
    html: "<html><body>result</body></html>",
    har: [{ url: "https://example.test/api/track", status: 200, body: "{\"status\":\"NOT_FOUND\"}" }],
    urlBefore: "https://example.test/tracking",
    urlAfter: "https://example.test/tracking",
    businessEnum: "NOT_FOUND",
    ...over,
  };
}

test("loads versioned graph JSON", () => {
  assert.equal(graph().graph_version, "1.0.0");
  assert.equal(graph().steps[0].type, "navigate");
});

test("P1 same document, P2 query, P3 path", () => {
  assert.equal(
    detectNavigationPattern("https://example.test/tracking", "https://example.test/tracking#x"),
    "P1",
  );
  assert.equal(
    detectNavigationPattern("https://example.test/tracking", "https://example.test/tracking?id=1"),
    "P2",
  );
  assert.equal(
    detectNavigationPattern("https://example.test/tracking", "https://example.test/result/1"),
    "P3",
  );
});

test("NOT_FOUND is success when the graph lists it", () => {
  const result = runGraph(graph(), replay({}));
  assert.equal(result.ok, true);
  assert.equal(result.pattern, "P1");
  assert.equal(result.businessEnum, "NOT_FOUND");
  assert.equal(result.outputs.status, "NOT_FOUND");
});

test("replays HTML and HAR for P2 and P3", () => {
  const p2 = runGraph(
    graph(),
    replay({
      urlAfter: "https://example.test/tracking?id=1",
      businessEnum: "IN_TRANSIT",
      html: "<div>in transit</div>",
    }),
  );
  assert.equal(p2.pattern, "P2");
  assert.ok(p2.outputs.html_length > 0);
  assert.equal(p2.outputs.har_entries, 1);

  const p3 = runGraph(
    graph(),
    replay({ urlAfter: "https://example.test/result/1", businessEnum: "DELIVERED" }),
  );
  assert.equal(p3.ok, true);
  assert.equal(p3.pattern, "P3");
});

test("bad user input is not GRAPH_STEP_FAILED", () => {
  const result = runGraph(graph(), replay({ userInputError: true, businessEnum: undefined }));
  assert.equal(result.failureCode, "VALIDATION_ERROR");
});

test("unexpected DOM or network is GRAPH_STEP_FAILED", () => {
  const result = runGraph(graph(), replay({ unexpected: true }));
  assert.equal(result.ok, false);
  assert.equal(result.failureCode, "GRAPH_STEP_FAILED");
});

test("timeout is GRAPH_STEP_FAILED", () => {
  const result = runGraph(graph(), replay({ timedOut: true }));
  assert.equal(result.failureCode, "GRAPH_STEP_FAILED");
});
