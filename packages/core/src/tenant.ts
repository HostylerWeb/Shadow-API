export class TenantIsolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TenantIsolationError";
  }
}

/** Ensures a vault session row is only used by its owning tenant. */
export function assertSessionBelongsToTenant(
  sessionTenantId: string,
  requestTenantId: string,
): void {
  if (sessionTenantId !== requestTenantId) {
    throw new TenantIsolationError("session_id does not belong to this tenant");
  }
}
