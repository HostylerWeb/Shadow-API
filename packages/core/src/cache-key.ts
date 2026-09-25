import { createHash } from "node:crypto";

export type CacheKeyInput = Record<string, string | number | boolean | null | undefined>;

/**
 * Build a stable Redis/cache key from manifest `key_fields` + job inputs + session_generation.
 */
export function buildCacheKey(parts: {
  connectorId: string;
  keyFields: readonly string[];
  inputs: CacheKeyInput;
  sessionGeneration?: number;
}): string {
  const payload: Record<string, unknown> = {
    connector_id: parts.connectorId,
  };

  for (const field of parts.keyFields) {
    if (field === "session_generation") {
      payload.session_generation = parts.sessionGeneration ?? 0;
      continue;
    }
    payload[field] = parts.inputs[field] ?? null;
  }

  const canonical = JSON.stringify(sortKeys(payload));
  const digest = createHash("sha256").update(canonical).digest("hex").slice(0, 32);
  return `cache:${parts.connectorId}:${digest}`;
}

/** Cache key for the Chapter 4 stub. Ignores `stub_outcome` (test-only force flag). */
export function stubCacheKey(connectorId: string, inputs: Record<string, unknown>): string {
  const keyFields = Object.keys(inputs)
    .filter((key) => key !== "stub_outcome")
    .sort();
  const flat: CacheKeyInput = {};
  for (const field of keyFields) {
    const value = inputs[field];
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean" ||
      value == null
    ) {
      flat[field] = value;
    }
  }
  return buildCacheKey({ connectorId, keyFields, inputs: flat });
}

export const STUB_CACHE_TTL_SECONDS = 3600;

function sortKeys(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.keys(obj)
    .sort()
    .reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = obj[key];
      return acc;
    }, {});
}
