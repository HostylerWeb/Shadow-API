import test from "node:test";
import assert from "node:assert/strict";
import { buildResultUrl, sanitizeSelector } from "../src/live-custom.js";

test("sanitizeSelector removes teach highlight classes", () => {
  assert.equal(sanitizeSelector("p.shadow-teach-hover"), "p");
  assert.equal(sanitizeSelector("div.foo.shadow-teach-active.bar"), "div.foo.bar");
});

test("buildResultUrl replaces templated query values", () => {
  const url = buildResultUrl(
    {
      kind: "lookup",
      pattern: "P2",
      result_url: "https://example.com/search?q={query}",
    },
    { query: "acme" },
  );
  assert.equal(url, "https://example.com/search?q=acme");
});
