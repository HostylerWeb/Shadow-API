export const JOB_STATUSES = [
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
  "blocked",
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];

const TERMINAL: ReadonlySet<JobStatus> = new Set([
  "succeeded",
  "failed",
  "cancelled",
  "blocked",
]);

export function isTerminalStatus(status: JobStatus): boolean {
  return TERMINAL.has(status);
}

const ALLOWED: Record<JobStatus, readonly JobStatus[]> = {
  queued: ["running", "cancelled"],
  running: ["succeeded", "failed", "cancelled", "blocked"],
  succeeded: [],
  failed: [],
  cancelled: [],
  blocked: [],
};

export function canTransition(from: JobStatus, to: JobStatus): boolean {
  return ALLOWED[from].includes(to);
}

export function assertTransition(from: JobStatus, to: JobStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid job transition: ${from} → ${to}`);
  }
}
