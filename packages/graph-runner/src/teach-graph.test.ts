import assert from "node:assert/strict";
import test from "node:test";
import { compileTeachGraph } from "./teach-graph.js";

const start = "https://generate-random.org/usernames";

test("same URL with fields keeps fill, click, wait, and extract", () => {
  const graph = compileTeachGraph({
    startUrl: start,
    resultUrl: start,
    kind: "read",
    pattern: "P1",
    formFields: [
      { key: "count", selector: "#count", control: "text", sample: "10" },
      { key: "style", selector: "select.style", control: "select", sample: "Gamer" },
      { key: "numbers", selector: "#numbers", control: "checkbox", sample: "false" },
    ],
    actions: [
      { type: "field", key: "count" },
      { type: "field", key: "style" },
      { type: "field", key: "numbers" },
      { type: "click", selector: "button.execute", label: "Execute" },
    ],
    waitSelector: ".username",
  });
  const types = graph.steps.map((step) => step.type);
  assert.deepEqual(types, ["navigate", "fill", "select", "check", "click", "wait", "extract"]);
  assert.equal(graph.steps.filter((step) => step.type === "navigate").length, 1);
  const check = graph.steps.find((step) => step.type === "check");
  assert.equal(check && check.type === "check" ? check.sample : "", "false");
});

test("read-only same URL with no interactions stays navigate and extract", () => {
  const graph = compileTeachGraph({
    startUrl: start,
    resultUrl: `${start}/`,
    kind: "read",
    pattern: "P1",
    formFields: [],
    waitSelector: "h1",
  });
  assert.deepEqual(
    graph.steps.map((step) => step.type),
    ["navigate", "wait", "extract"],
  );
});

test("lookup still navigates to the result URL", () => {
  const graph = compileTeachGraph({
    startUrl: "https://example.com/",
    resultUrl: "https://example.com/search?q={{query}}",
    kind: "lookup",
    pattern: "P2",
    formFields: [{ key: "query", selector: "input[name=q]" }],
    submitSelector: "button[type=submit]",
  });
  const types = graph.steps.map((step) => step.type);
  assert.deepEqual(types, ["navigate", "fill", "click", "navigate", "branch", "extract"]);
  const result = graph.steps.find((step) => step.id === "result");
  assert.equal(result?.type, "navigate");
  if (result?.type === "navigate") assert.match(result.url, /search/);
});

test("stages keep every click and skip a second navigate on the same page", () => {
  const graph = compileTeachGraph({
    startUrl: start,
    resultUrl: start,
    kind: "read",
    pattern: "P1",
    formFields: [],
    stages: [
      {
        url: start,
        fields: [{ key: "count", selector: "#count", control: "text" }],
        clicks: [
          { selector: "button.five", label: "5" },
          { selector: "button.execute", label: "Execute" },
        ],
        actions: [
          { type: "field", key: "count" },
          { type: "click", selector: "button.five" },
          { type: "click", selector: "button.execute" },
        ],
      },
    ],
    waitSelector: ".username",
  });
  assert.deepEqual(
    graph.steps.map((step) => step.type),
    ["navigate", "fill", "click", "click", "wait", "extract"],
  );
});
