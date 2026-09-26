import test from "node:test";
import assert from "node:assert/strict";
import {
  compositeReady,
  listArrayKeyFromSpec,
  normalizeToComposite,
  outputSchemaFromSpec,
  parseExtractSpec,
  primaryOutputName,
} from "../src/index.js";

test("normalizeToComposite maps marked_list with array_key", () => {
  const spec = parseExtractSpec(
    JSON.stringify({
      kind: "marked_list",
      row_selector: "li",
      array_key: "entries",
      fields: [{ key: "field_1", selector: "a" }],
    }),
  );
  assert.ok(spec);
  const composite = normalizeToComposite(spec!);
  assert.equal(composite.blocks[0]?.type, "list");
  if (composite.blocks[0]?.type === "list") {
    assert.equal(composite.blocks[0].key, "entries");
  }
});

test("outputSchemaFromSpec uses author list key", () => {
  const composite = normalizeToComposite({
    kind: "marked_list",
    row_selector: "li",
    array_key: "products",
    fields: [{ key: "field_1", selector: "a" }],
  });
  const schema = outputSchemaFromSpec(composite, "fallback");
  assert.ok(schema.products);
});

test("primaryOutputName prefers list block key", () => {
  const name = primaryOutputName(
    { kind: "composite", blocks: [{ type: "list", key: "items", row_selector: "li", fields: [] }] },
    "result",
  );
  assert.equal(name, "items");
});

test("compositeReady requires selectors", () => {
  assert.equal(
    compositeReady({
      kind: "composite",
      blocks: [{ type: "scalar", key: "title", selector: "" }],
    }),
    false,
  );
  assert.equal(
    compositeReady({
      kind: "composite",
      blocks: [{ type: "scalar", key: "title", selector: "h1" }],
    }),
    true,
  );
});

test("listArrayKeyFromSpec defaults to items", () => {
  assert.equal(
    listArrayKeyFromSpec({
      kind: "marked_list",
      row_selector: "li",
      fields: [{ key: "a", selector: "b" }],
    }),
    "items",
  );
});
