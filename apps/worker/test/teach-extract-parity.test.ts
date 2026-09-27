import assert from "node:assert/strict";
import test from "node:test";
import { normalizeToComposite, primaryOutputName } from "@shadowapi/teach-extract";

test("teach composite primary output name is stable for worker and studio", () => {
  const spec = {
    blocks: [{ kind: "scalar", key: "title", selector: "h1" }],
  };
  const composite = normalizeToComposite(spec);
  assert.equal(primaryOutputName(composite), "title");
});
