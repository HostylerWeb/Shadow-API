import test from "node:test";
import assert from "node:assert/strict";
import { applyPageIntent, canPublish, emptyTeachSession, guessTemplatingSample, isReadOnlyWorkflow, pendingIntentUrl } from "../src/teach/session.js";

test("pendingIntentUrl blocks until labeled", () => {
  const state = applyPageIntent(
    applyPageIntent(
      { pagesByKey: {}, startUrl: "https://example.com/", resultUrl: "", actionUrl: "", inputSelector: "", pattern: "P1", extract: null, templatingSample: "" },
      "https://example.com/",
      "start",
    ),
    "https://example.com/search?q=acme",
    "result",
  );
  assert.equal(pendingIntentUrl(state, "https://example.com/other"), "https://example.com/other");
  assert.equal(pendingIntentUrl(state, "https://example.com/search?q=acme"), null);
});

test("guessTemplatingSample picks new query param", () => {
  const sample = guessTemplatingSample("https://example.com/", "https://example.com/search?q=acme");
  assert.equal(sample, "acme");
});

test("isReadOnlyWorkflow is false until result URL is set", () => {
  const startOnly = emptyTeachSession("https://example.com/");
  assert.equal(isReadOnlyWorkflow(startOnly), false);
  const read = applyPageIntent(
    applyPageIntent(startOnly, "https://example.com/", "start"),
    "https://example.com/",
    "result",
  );
  assert.equal(isReadOnlyWorkflow(read), true);
});

test("canPublish requires non-empty preview for marked_list", () => {
  const base = {
    pagesByKey: {},
    startUrl: "https://example.com/",
    resultUrl: "https://example.com/r",
    actionUrl: "",
    inputSelector: "",
    pattern: "P2" as const,
    templatingSample: "x",
    extract: {
      kind: "marked_list" as const,
      row_selector: "li",
      fields: [{ key: "name", selector: "a" }],
    },
    previewRows: [{ name: "Acme" }],
  };
  assert.equal(canPublish(base), true);
  assert.equal(canPublish({ ...base, previewRows: [{ name: "" }] }), false);
});

test("canPublish accepts composite with preview payload", () => {
  const base = {
    pagesByKey: {},
    startUrl: "https://example.com/",
    resultUrl: "https://example.com/",
    actionUrl: "",
    inputSelector: "",
    pattern: "P1" as const,
    templatingSample: "",
    extract: {
      kind: "composite" as const,
      blocks: [
        {
          type: "list" as const,
          key: "items",
          row_selector: "li",
          fields: [{ key: "field_1", selector: "a" }],
        },
      ],
    },
    previewPayload: { items: [{ field_1: "x" }] },
  };
  assert.equal(canPublish(base), true);
});
