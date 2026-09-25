import test from "node:test";
import assert from "node:assert/strict";
import {
  cacheTtlSeconds,
  carrierCacheKey,
  lintCarrierManifest,
  loadCarrierFixture,
  preflightCarrier,
  readCachedOutputs,
  runCarrierFixture,
  toCacheRecord,
} from "./index.js";

const names = [
  "not_found_timeline",
  "in_transit",
  "exception",
  "delivered_no_doc",
  "delivered_zip_gate",
  "delivered_vault_session",
  "challenge_wall",
] as const;

test("manifest matches meta-schema and graph v1.0.1-g2", () => {
  lintCarrierManifest();
});

test("destination_zip required only for POD without a session", () => {
  assert.equal(preflightCarrier({ tracking_number: "A", include_pod_document: false }), null);
  assert.ok(preflightCarrier({ tracking_number: "A", include_pod_document: true }));
  assert.equal(
    preflightCarrier({ tracking_number: "A", include_pod_document: true, destination_zip: "10001" }),
    null,
  );
  assert.equal(preflightCarrier({ tracking_number: "A", include_pod_document: true }, "sess-1"), null);
});

test("seven carrier fixtures", () => {
  const notFound = runCarrierFixture(loadCarrierFixture("not_found_timeline"));
  assert.equal(notFound.jobStatus, "succeeded");
  assert.equal(notFound.outputs.status, "NOT_FOUND");

  const transit = runCarrierFixture(loadCarrierFixture("in_transit"));
  assert.equal(transit.jobStatus, "succeeded");
  assert.equal(transit.outputs.status, "IN_TRANSIT");
  assert.equal(transit.outputs.document_url, undefined);

  const exception = runCarrierFixture(loadCarrierFixture("exception"));
  assert.equal(exception.jobStatus, "succeeded");
  assert.equal(exception.outputs.status, "EXCEPTION");

  const noDoc = runCarrierFixture(loadCarrierFixture("delivered_no_doc"));
  assert.equal(noDoc.jobStatus, "succeeded");
  assert.equal(noDoc.outputs.status, "DELIVERED");
  assert.equal(noDoc.outputs.document_url, undefined);
  assert.equal(noDoc.outputs.signed_by, "A. Receiver");

  const zip = runCarrierFixture(loadCarrierFixture("delivered_zip_gate"));
  assert.equal(zip.jobStatus, "succeeded");
  assert.equal(typeof zip.outputs.document_url, "string");

  const vault = runCarrierFixture(loadCarrierFixture("delivered_vault_session"));
  assert.equal(vault.jobStatus, "succeeded");
  assert.equal(typeof vault.outputs.document_url, "string");

  const wall = runCarrierFixture(loadCarrierFixture("challenge_wall"));
  assert.equal(wall.jobStatus, "blocked");
  assert.equal(wall.failureCode, "CHALLENGE_REQUIRED");

  assert.equal(names.length, 7);
});

test("cache TTL differs and document_url is signed on read", () => {
  assert.ok(cacheTtlSeconds("DELIVERED") > cacheTtlSeconds("IN_TRANSIT"));
  assert.ok(cacheTtlSeconds("IN_TRANSIT") > cacheTtlSeconds("NOT_FOUND"));

  const live = runCarrierFixture(loadCarrierFixture("delivered_zip_gate"));
  const stored = toCacheRecord(live.outputs);
  assert.equal(stored.body.document_url, undefined);
  assert.equal(typeof stored.body.document_blob_id, "string");

  const read = readCachedOutputs(stored.body, 1_000);
  assert.match(String(read.document_url), /exp=901000/);

  const keyA = carrierCacheKey({ tracking_number: "DZ1", include_pod_document: true }, 1);
  const keyB = carrierCacheKey({ tracking_number: "DZ1", include_pod_document: false }, 1);
  const keyC = carrierCacheKey({ tracking_number: "DZ1", include_pod_document: true }, 2);
  assert.notEqual(keyA, keyB);
  assert.notEqual(keyA, keyC);
});
