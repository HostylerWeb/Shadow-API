# MCP integration

ShadowAPI exposes the same job API as MCP tools on the gateway at `POST /mcp` (Streamable HTTP). Authenticate with `Authorization: Bearer <API_KEY>`.

## Tools

| Tool | REST equivalent |
|------|-----------------|
| `shadow_start_workflow` | `POST /v1/jobs` |
| `shadow_get_job_status` | `GET /v1/jobs/:id` |
| `shadow_get_job_result` | `GET /v1/jobs/:id/result` |
| `shadow_cancel_job` | `DELETE /v1/jobs/:id` |
| `shadow_list_connectors` | `GET /v1/connectors` |

## Agent polling contract

1. Call `shadow_start_workflow` with `connector_id`, `inputs`, optional `idempotency_key`.
2. Poll `shadow_get_job_status` until `result_ready` or a terminal status (`succeeded`, `failed`, `cancelled`, `blocked`).
3. On `result_ready`, call `shadow_get_job_result`.
4. On `blocked`, stop — a human must fix access (captcha, login, etc.).

Unknown fields on start return `VALIDATION_ERROR` and do not enqueue.

## OpenAPI

REST shapes: [openapi/v1.openapi.json](./openapi/v1.openapi.json) and failure examples in [API-FAILURES.md](./API-FAILURES.md).
