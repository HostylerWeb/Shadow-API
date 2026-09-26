import test from "node:test";
import assert from "node:assert/strict";
import { inputHelp } from "../app/endpoints/test/input-help.js";

test("inputHelp explains query as search text", () => {
  const q = inputHelp("query");
  assert.equal(q.title, "What to search for");
  assert.match(q.hint, /company name/i);
  assert.match(q.placeholder, /tesco/i);
});

test("inputHelp handles input1 from teach defaults", () => {
  const h = inputHelp("input1");
  assert.equal(h.title, "What to search for");
});

test("inputHelp humanizes custom keys", () => {
  const h = inputHelp("tracking_number");
  assert.match(h.title, /Tracking/);
});
