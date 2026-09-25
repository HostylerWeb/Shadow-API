import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const Ajv = require("ajv") as new (options?: object) => {
  compile: (schema: object) => ((data: unknown) => boolean) & { errors?: unknown };
  errorsText: (errors: unknown) => string;
};
import { buildCacheKey, type CacheKeyInput } from "@shadowapi/core";

const connectorDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../connectors/carrier_x_pod");

export type CarrierManifest = {
  connector_id: string;
  connector_version: string;
  graph_version: string;
  auth_mode: string;
  artifact_handling: string;
  not_found_is_success: boolean;
  cache: {
    key_fields: string[];
    ttl_by_status_seconds: Record<string, number>;
    never_cache_fields: string[];
  };
};

export type CarrierFixture = {
  name: string;
  inputs: { tracking_number: string; include_pod_document?: boolean; destination_zip?: string };
  session_id?: string;
  session_generation?: number;
  html: string;
  har: Array<{ url: string; status: number }>;
  challenge?: boolean;
  bad_zip?: boolean;
  invalid_session?: boolean;
  status?: "NOT_FOUND" | "IN_TRANSIT" | "EXCEPTION" | "DELIVERED";
  signed_by?: string;
};

export type CarrierRun = {
  jobStatus: "succeeded" | "failed" | "blocked";
  failureCode?: string;
  outputs: Record<string, unknown>;
  graphVersion: string;
};

const ajv = new Ajv({ allErrors: true, strict: false });

export function loadCarrierManifest(): CarrierManifest {
  return JSON.parse(readFileSync(path.join(connectorDir, "manifest.json"), "utf8")) as CarrierManifest;
}

export function lintCarrierManifest(): void {
  const schema = JSON.parse(readFileSync(path.join(connectorDir, "manifest.schema.json"), "utf8"));
  const validate = ajv.compile(schema);
  const manifest = JSON.parse(readFileSync(path.join(connectorDir, "manifest.json"), "utf8"));
  if (!validate(manifest)) {
    throw new Error(`manifest invalid: ${ajv.errorsText(validate.errors)}`);
  }
  const graph = JSON.parse(readFileSync(path.join(connectorDir, "graph.v1.0.1-g2.json"), "utf8")) as {
    graph_version: string;
  };
  if (graph.graph_version !== "v1.0.1-g2") {
    throw new Error("graph_version must be v1.0.1-g2");
  }
}

export function preflightCarrier(inputs: Record<string, unknown>, sessionId?: string): string | null {
  const wantsPod = inputs.include_pod_document === true;
  const zip = typeof inputs.destination_zip === "string" && inputs.destination_zip.length > 0;
  if (wantsPod && !sessionId && !zip) {
    return "destination_zip is required when include_pod_document is true and session_id is absent";
  }
  return null;
}

export function carrierCacheKey(
  inputs: Record<string, unknown>,
  sessionGeneration = 0,
): string {
  const manifest = loadCarrierManifest();
  const flat: CacheKeyInput = {
    tracking_number: typeof inputs.tracking_number === "string" ? inputs.tracking_number : null,
    include_pod_document: inputs.include_pod_document === true,
  };
  return buildCacheKey({
    connectorId: "carrier_x_pod",
    keyFields: manifest.cache.key_fields,
    inputs: flat,
    sessionGeneration,
  });
}

export function cacheTtlSeconds(status: string): number {
  const ttl = loadCarrierManifest().cache.ttl_by_status_seconds[status];
  if (!ttl) throw new Error(`No TTL for status ${status}`);
  return ttl;
}

/** Persist cache without document_url. Signing happens when the client reads. */
export function toCacheRecord(outputs: Record<string, unknown>): { body: Record<string, unknown>; ttl: number } {
  const status = String(outputs.status ?? "");
  const body = { ...outputs };
  delete body.document_url;
  return { body, ttl: cacheTtlSeconds(status) };
}

export function signDocumentUrl(blobId: string, now = Date.now()): string {
  const exp = now + 15 * 60 * 1000;
  return `https://files.shadowapi.local/${blobId}?exp=${exp}`;
}

export function readCachedOutputs(cached: Record<string, unknown>, now = Date.now()): Record<string, unknown> {
  const outputs = { ...cached };
  if (typeof outputs.document_blob_id === "string") {
    outputs.document_url = signDocumentUrl(outputs.document_blob_id, now);
  }
  return outputs;
}

export function runCarrierFixture(fixture: CarrierFixture): CarrierRun {
  const graphVersion = "v1.0.1-g2";
  if (fixture.challenge) {
    return { jobStatus: "blocked", failureCode: "CHALLENGE_REQUIRED", outputs: {}, graphVersion };
  }
  const pre = preflightCarrier(fixture.inputs, fixture.session_id);
  if (pre) {
    return { jobStatus: "failed", failureCode: "VALIDATION_ERROR", outputs: {}, graphVersion };
  }
  if (fixture.invalid_session) {
    return { jobStatus: "failed", failureCode: "SESSION_EXPIRED", outputs: {}, graphVersion };
  }
  if (fixture.bad_zip) {
    return { jobStatus: "failed", failureCode: "ARTIFACT_GATE_FAILED", outputs: {}, graphVersion };
  }

  const status = fixture.status ?? "NOT_FOUND";
  const outputs: Record<string, unknown> = { status };
  if (fixture.signed_by) outputs.signed_by = fixture.signed_by;

  const wantsDoc = fixture.inputs.include_pod_document === true && status === "DELIVERED";
  if (wantsDoc) {
    outputs.document_blob_id = `pod-${fixture.inputs.tracking_number}`;
    outputs.document_url = signDocumentUrl(String(outputs.document_blob_id));
  }

  return { jobStatus: "succeeded", outputs, graphVersion };
}

export function loadCarrierFixture(name: string): CarrierFixture {
  return JSON.parse(readFileSync(path.join(connectorDir, "fixtures", `${name}.json`), "utf8")) as CarrierFixture;
}
