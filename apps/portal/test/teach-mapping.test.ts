import test from "node:test";
import assert from "node:assert/strict";
import { toMarkedListExtract, sampleHasValues, nextFieldKey } from "../src/teach/mapping.js";
import type { TeachField } from "../src/teach/protocol.js";

test("toMarkedListExtract preserves field order", () => {
  const fields: TeachField[] = [
    { id: "1", key: "z", selector: "a" },
    { id: "2", key: "a", selector: "b" },
  ];
  const extract = toMarkedListExtract("li", fields);
  assert.deepEqual(
    extract.fields.map((f) => f.key),
    ["z", "a"],
  );
});

test("nextFieldKey avoids collisions", () => {
  const fields: TeachField[] = [{ id: "1", key: "field_1", selector: "a" }];
  assert.equal(nextFieldKey(fields), "field_2");
});

test("sampleHasValues detects non-empty row", () => {
  assert.equal(sampleHasValues([{ name: "" }]), false);
  assert.equal(sampleHasValues([{ name: "Acme" }]), true);
});
