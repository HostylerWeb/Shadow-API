export const DEFAULT_IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

export type IdempotencyLookup = {
  tenantId: string;
  idempotencyKey: string;
  existingJobId: string;
  expiresAt: Date;
};

/**
 * Returns the existing job id when the same tenant + idempotency key is still within TTL.
 */
export function resolveIdempotentJob(
  records: readonly IdempotencyLookup[],
  tenantId: string,
  idempotencyKey: string | undefined,
  now: Date = new Date(),
): string | null {
  if (!idempotencyKey) return null;
  const hit = records.find(
    (r) =>
      r.tenantId === tenantId &&
      r.idempotencyKey === idempotencyKey &&
      r.expiresAt.getTime() > now.getTime(),
  );
  return hit?.existingJobId ?? null;
}

export function idempotencyExpiresAt(
  now: Date = new Date(),
  ttlMs: number = DEFAULT_IDEMPOTENCY_TTL_MS,
): Date {
  return new Date(now.getTime() + ttlMs);
}
