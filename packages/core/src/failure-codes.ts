export const FAILURE_CODES = [
  "VALIDATION_ERROR",
  "SESSION_EXPIRED",
  "CHALLENGE_REQUIRED",
  "ARTIFACT_GATE_FAILED",
  "PROXY_UNAVAILABLE",
  "TARGET_TIMEOUT",
  "GRAPH_STEP_FAILED",
  "RATE_LIMITED",
  "INTERNAL_ERROR",
] as const;

export type FailureCode = (typeof FAILURE_CODES)[number];

export function isFailureCode(value: string): value is FailureCode {
  return (FAILURE_CODES as readonly string[]).includes(value);
}
