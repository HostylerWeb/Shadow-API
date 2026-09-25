# API failure responses

Clients should treat any response with a top-level `failure` object as an error. Poll endpoints may also include `failure` on the job resource when `status` is `failed` or `blocked`.

Canonical codes are defined in [PROJECT.md §8.2](./PROJECT.md#82-failure-codes-representative).

## Gateway (HTTP) examples

### `VALIDATION_ERROR` — missing auth

```http
HTTP/1.1 401 Unauthorized
```

```json
{
  "failure": {
    "code": "VALIDATION_ERROR",
    "message": "Missing Bearer API key"
  }
}
```

### `VALIDATION_ERROR` — invalid body (never enqueues)

```http
HTTP/1.1 400 Bad Request
```

```json
{
  "failure": {
    "code": "VALIDATION_ERROR",
    "message": "connector_id is required"
  }
}
```

### `VALIDATION_ERROR` — job not found (tenant isolation)

```http
HTTP/1.1 404 Not Found
```

```json
{
  "failure": {
    "code": "VALIDATION_ERROR",
    "message": "Job not found"
  }
}
```

### `VALIDATION_ERROR` — result not ready

```http
HTTP/1.1 409 Conflict
```

```json
{
  "failure": {
    "code": "VALIDATION_ERROR",
    "message": "Result not ready"
  },
  "status": "running"
}
```

## Job terminal failures (worker / graph)

These appear on `GET /v1/jobs/:id` when `status` is `failed` or `blocked`:

```json
{
  "job_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "failed",
  "result_ready": false,
  "failure": {
    "code": "SESSION_EXPIRED",
    "message": "Stored session is no longer valid on the target portal"
  },
  "poll_after_ms": null,
  "graph_version": "1.0.0"
}
```

Every code in `packages/core` `FAILURE_CODES` uses the same body. Swap `code` and `message`:

```json
{ "failure": { "code": "VALIDATION_ERROR", "message": "Request or job failed validation" } }
{ "failure": { "code": "SESSION_EXPIRED", "message": "Stored session is no longer valid on the target portal" } }
{ "failure": { "code": "CHALLENGE_REQUIRED", "message": "Target requires a human challenge" } }
{ "failure": { "code": "ARTIFACT_GATE_FAILED", "message": "Required document or proof was not produced" } }
{ "failure": { "code": "PROXY_UNAVAILABLE", "message": "No egress proxy could be assigned" } }
{ "failure": { "code": "TARGET_TIMEOUT", "message": "Target portal did not respond in time" } }
{ "failure": { "code": "GRAPH_STEP_FAILED", "message": "A connector graph step failed unexpectedly" } }
{ "failure": { "code": "RATE_LIMITED", "message": "Rate limit exceeded" } }
{ "failure": { "code": "INTERNAL_ERROR", "message": "Unexpected platform error" } }
```

OpenAPI route list: `GET /v1/openapi.json` on the gateway.
