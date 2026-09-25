# carrier_x_pod runbook

## Session renewal

When a job fails with `SESSION_EXPIRED`, the vault row is still that tenant’s. The customer signs in again in Studio or supplies a new `session_id`. Do not copy cookies from another tenant. A changed cookie fingerprint bumps `session_generation` so cached reads do not reuse the old session.

## Challenge

`CHALLENGE_REQUIRED` means the site showed a human check. Do not retry the same job. Tell the customer a person must open the session. This failure does not enter the repair lane.

## Quarantine

If the same connector keeps failing `GRAPH_STEP_FAILED`, leave `connector_version` in place and stop promoting graphs until an author approves a repair. Cached reads of the last good status can continue. New live jobs stay on the current published graph until that approval.

## Customer note when the graph changes

A repair promotes `graph_version` only. `connector_version` stays the same, so request and response fields do not change. Tell the customer: "The tracking steps were updated. Your API fields are unchanged. Poll the same `POST /v1/jobs` connector."
