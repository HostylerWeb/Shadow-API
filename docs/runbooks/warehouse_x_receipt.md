# warehouse_x_receipt runbook

## Session renewal

When a job fails with `SESSION_EXPIRED`, the tenant re-authenticates in Studio or supplies a new `session_id`. Vault rows stay scoped to `(tenant_id, connector_id, session_id)`.

## Challenge

`CHALLENGE_REQUIRED` means a human check blocked automation. Do not retry blindly. This failure does not enter the repair lane.

## Quarantine

Repeated `GRAPH_STEP_FAILED` for this connector sets a Redis quarantine flag (`connector:quarantine:warehouse_x_receipt`) for one hour. Cached reads may continue; new live jobs fail fast until ops clears quarantine or approves a graph repair.

## Customer note when the graph changes

Repairs bump `graph_version` only. `connector_version` and API fields stay the same. Tell integrators: "Receipt lookup steps were updated; your request shape is unchanged."
