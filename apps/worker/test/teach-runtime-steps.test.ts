import assert from "node:assert/strict";
import test from "node:test";
import type { GraphDocument } from "@shadowapi/graph-runner";
import type { Page } from "playwright-core";
import { checkboxChecked, runTeachGraph } from "../src/teach-runtime.js";

test("checkboxChecked is on only for true, 1, and on", () => {
  assert.equal(checkboxChecked("true"), true);
  assert.equal(checkboxChecked("1"), true);
  assert.equal(checkboxChecked("on"), true);
  assert.equal(checkboxChecked("false"), false);
  assert.equal(checkboxChecked("0"), false);
  assert.equal(checkboxChecked(""), false);
});

test("runTeachGraph calls select, check, and click in order", async () => {
  const calls: string[] = [];
  const page = {
    setDefaultTimeout() {},
    url: () => "https://generate-random.org/usernames",
    goto: async () => {
      calls.push("goto");
    },
    getByRole: () => ({
      first: () => ({
        isVisible: async () => false,
        click: async () => undefined,
      }),
    }),
    waitForTimeout: async () => undefined,
    locator: (selector: string) => ({
      first: () => ({
        fill: async (value: string) => {
          calls.push(`fill:${selector}:${value}`);
        },
        click: async () => {
          calls.push(`click:${selector}`);
        },
        evaluate: async (fn: (el: { tagName: string }) => string) => fn({ tagName: "SELECT" }),
        selectOption: async (value: string | { label: string }) => {
          calls.push(`select:${selector}:${typeof value === "string" ? value : value.label}`);
        },
        setChecked: async (checked: boolean) => {
          calls.push(`check:${selector}:${checked}`);
        },
        waitFor: async () => {
          calls.push(`wait:${selector}`);
        },
        innerText: async () => "ThunderTiger",
      }),
    }),
    waitForLoadState: async () => undefined,
  } as unknown as Page;

  const graph: GraphDocument = {
    graph_version: "studio-1",
    success_enums: ["OK"],
    steps: [
      { id: "open", type: "navigate", url: "https://generate-random.org/usernames" },
      { id: "count", type: "fill", field: "count", selector: "#count" },
      { id: "style", type: "select", field: "style", selector: "select.style" },
      { id: "numbers", type: "check", field: "numbers", selector: "#numbers" },
      { id: "go", type: "click", selector: "button.execute" },
      { id: "ready", type: "wait", selector: ".username" },
      { id: "extract", type: "extract" },
    ],
  };

  const result = await runTeachGraph({
    page,
    graph,
    inputs: { count: "5", style: "gamer", numbers: "false" },
    pattern: "P1",
    resolveUrl: (url) => url,
    trace: [],
    timeoutMs: 5_000,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(calls, [
    "goto",
    "fill:#count:5",
    "select:select.style:gamer",
    "check:#numbers:false",
    "click:button.execute",
    "wait:.username",
  ]);
});

test("hidden checkbox is toggled in the page instead of a pointer click", async () => {
  const calls: string[] = [];
  const page = {
    setDefaultTimeout() {},
    url: () => "https://generate-random.org/usernames",
    goto: async () => undefined,
    getByRole: () => ({ first: () => ({ isVisible: async () => false, click: async () => undefined }) }),
    waitForTimeout: async () => undefined,
    locator: () => ({
      first: () => ({
        evaluate: async (fn: (el: Element, arg?: boolean) => unknown, arg?: boolean) => {
          if (fn.length < 2) return true;
          calls.push(`dom-check:${arg}`);
          return undefined;
        },
        setChecked: async () => {
          calls.push("pointer-check");
        },
      }),
    }),
    waitForLoadState: async () => undefined,
  } as unknown as Page;

  const graph: GraphDocument = {
    graph_version: "studio-1",
    success_enums: ["OK"],
    steps: [{ id: "numbers", type: "check", field: "include_numbers", selector: "input.sr-only", sample: "false" }, { id: "extract", type: "extract" }],
  };
  const result = await runTeachGraph({
    page,
    graph,
    inputs: {},
    pattern: "P1",
    resolveUrl: (url) => url,
    trace: [],
    timeoutMs: 5_000,
  });
  assert.equal(result.ok, true);
  assert.deepEqual(calls, ["dom-check:false"]);
});

test("hidden select is set without waiting for it to be visible", async () => {
  const calls: string[] = [];
  let probes = 0;
  const page = {
    setDefaultTimeout() {},
    url: () => "https://www.random-name-generator.com/georgia-phone-number-generator",
    goto: async () => undefined,
    getByRole: () => ({ first: () => ({ isVisible: async () => false, click: async () => undefined }) }),
    waitForTimeout: async () => undefined,
    evaluate: async () => {
      calls.push("dom-select");
      return true;
    },
    locator: (selector: string) => ({
      first: () => ({
        evaluate: async (fn: (el: { tagName: string; hidden?: boolean; className?: string }) => unknown) => {
          probes += 1;
          if (probes === 1) return fn({ tagName: "SELECT" });
          return fn({ tagName: "SELECT", hidden: true, className: "choices__input" });
        },
        selectOption: async () => {
          calls.push(`selectOption:${selector}`);
        },
      }),
    }),
    waitForLoadState: async () => undefined,
  } as unknown as Page;

  const graph: GraphDocument = {
    graph_version: "studio-1",
    success_enums: ["OK"],
    steps: [
      { id: "type", type: "select", field: "type", selector: "#type", sample: "mobile" },
      { id: "extract", type: "extract" },
    ],
  };
  const result = await runTeachGraph({
    page,
    graph,
    inputs: {},
    pattern: "P2",
    resolveUrl: (url) => url,
    trace: [],
    timeoutMs: 5_000,
  });
  assert.equal(result.ok, true);
  assert.deepEqual(calls, ["dom-select"]);
});
