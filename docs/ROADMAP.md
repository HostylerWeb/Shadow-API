# ShadowAPI — Build roadmap (A to Z)

Follow this file in order. Product behavior is in [OVERVIEW.md](./OVERVIEW.md). Architecture and the `carrier_x_pod` contract are in [PROJECT.md](./PROJECT.md). Why this order matters is in [POTENTIAL.md](./POTENTIAL.md).

**Stack:** TypeScript monorepo, Fastify gateway, PostgreSQL, Redis + BullMQ, S3, separate Camofox workers, Next.js portal/Studio later. Billing is a local plan gateway until a payment provider is chosen.

**Versions:** use the **latest stable release** of everything at the time you install or upgrade it. That includes Node.js, pnpm, TypeScript, Fastify, PostgreSQL, Redis, BullMQ, the AWS/S3 SDK, Next.js, Docker images, and every other direct dependency. Do not pin an older major because a doc once named it. Do not stay on a deprecated Node release. When adding a package, take the current latest version, commit the lockfile, and re-check latest before each chapter that adds dependencies. Connector `connector_version` / `graph_version` are product versions — they are not this rule.

**Rule:** do not start a later chapter until the current chapter’s exit checklist is done. Studio and billing wait until one catalog endpoint works.

Last updated: 2026-09-25

---

## How to use this

- Check boxes as you finish them.
- Each chapter ends with **Done when**.
- “Client” means an integrator calling the API, not a person clicking a vendor website.

---

## Chapter 1 — Repository and local platform

### 1.1 Monorepo

- [x] Install the **latest stable Node.js** and the **latest pnpm** (check current releases; do not use an older LTS if a newer stable exists)
- [x] pnpm workspace at the repo root
- [x] Every dependency added at its **latest version** (`pnpm add <pkg>` with no old version pin; commit the lockfile)
- [x] `engines` in root `package.json` requires that latest Node major
- [x] `apps/gateway` — Fastify (latest)
- [x] `apps/worker` — BullMQ consumer only
- [x] `packages/core` — job state, validation, cache keys
- [x] `packages/graph-runner` — package stub only (step engine is Chapter 5)
- [x] Shared TypeScript config, ESLint
- [x] `.env.example` for Postgres, Redis, S3, API base URL (no secrets committed)

### 1.2 Local dependencies

- [x] `docker-compose` for **latest stable** PostgreSQL and Redis images (official tags that track current stable, not an old major)
- [x] Local S3 stand-in (MinIO) or documented dev bucket
- [x] One command to boot infra (`pnpm dev:infra` or equivalent)
- [x] README note: how to run gateway and worker

### 1.3 CI skeleton

- [x] GitHub Actions: install, lint, typecheck, unit tests, gateway integration tests (Postgres service)

**Done when:** a fresh clone starts Postgres, Redis, gateway, and worker locally, and CI runs on a pull request.

---

## Chapter 2 — Data model and domain package

### 2.1 PostgreSQL schema

- [x] Tenants (orgs)
- [x] API keys (hashed secret, scopes, tenant id)
- [x] Connectors and published versions (manifest JSON, `connector_version`, `graph_version`)
- [x] Jobs: `queued | running | succeeded | failed | cancelled | blocked`, inputs/outputs JSON, failure code, idempotency key, `run_mode`, optional `session_id`
- [x] **`sessions` vault table:** `tenant_id`, `connector_id`, `session_id`, `session_generation`, `encrypted_storage_state`, timestamps; optional sticky proxy key (`vault_sessions`)
- [x] Tenant isolation: API key → `tenant_id`; a key cannot reference another tenant’s `session_id` (`packages/core` helper)
- [x] Usage events (cached vs live) — written now, billed in Chapter 11
- [x] Audit log table (who published a graph, who reauthed)

Schema lives in `packages/db` (`pnpm db:migrate`).

### 2.2 `packages/core`

- [x] Job state machine transitions (illegal jumps rejected)
- [x] Failure codes from [PROJECT.md §8.2](./PROJECT.md#82-failure-codes-representative)
- [x] Idempotency: same key returns the existing job inside TTL
- [x] Cache key builder matches manifest `key_fields` + `session_generation`
- [x] Unit tests for transitions, idempotency, and cache keys

**Done when:** schema migrates cleanly and core tests pass without HTTP or a browser.

---

## Chapter 3 — Public API (what clients call)

### 3.1 Fastify gateway

- [x] `POST /v1/jobs` — auth, validate, enqueue (cache hit: Chapter 4), return `job_id`, `status`, `poll_after_ms`, `graph_version`
- [x] `GET /v1/jobs/:id` — status for that tenant only
- [x] `GET /v1/jobs/:id/result` — outputs when `result_ready`
- [x] `DELETE /v1/jobs/:id` — cancel
- [x] `GET /v1/connectors` — catalog the key is allowed to call (empty until Chapter 6)
- [x] API key auth on every `/v1` route
- [x] Request validation errors return `VALIDATION_ERROR` and never enqueue

### 3.2 Contract quality

- [x] OpenAPI document (`GET /v1/openapi.json`, source `docs/openapi/v1.openapi.json`)
- [x] Example error bodies — [API-FAILURES.md](./API-FAILURES.md)
- [x] Tenant isolation test: key A cannot read key B’s job (`apps/gateway/test`)
- [x] Idempotency test: duplicate POST returns the same `job_id`

**Done when:** with curl you can create a job, poll it, and cancel it, and a bad body never enqueues. Reading a succeeded result after a live worker run is Chapter 4.

---

## Chapter 4 — Queue and a fake worker

### 4.1 Redis + BullMQ

- [x] Gateway enqueues live work; cache hits never enqueue
- [x] Worker updates job status in Postgres (`running` → terminal)
- [x] Retries do not duplicate a completed idempotent job
- [x] Per-tenant concurrency limit (`TENANT_CONCURRENCY`, default 2)

### 4.2 Fake runner

- [x] Worker completes a job using a stub graph (fixed JSON out) so the API is testable before Camofox
- [x] `blocked` and `failed` paths can be forced in tests (`inputs.stub_outcome`)

**Done when:** `POST /v1/jobs` with `run_mode: live` goes queued → running → succeeded via the worker, and a cached repeat does not.

---

## Chapter 5 — Graph runner and fixtures

### 5.1 Runner

- [x] Load a versioned graph JSON
- [x] Ordered steps, branches, timeouts
- [x] After submit, support **P1** (same-page/SPA), **P2** (query change), **P3** (path navigation) — see [PROJECT.md §6.3.1](./PROJECT.md#631-post-submit-navigation-patterns-tracking-and-similar-flows)
- [x] Map page/network signals to business enums (`NOT_FOUND` is success when the graph `success_enums` include it)
- [x] Emit `GRAPH_STEP_FAILED` only for unexpected DOM/network — not for bad user input

### 5.2 Fixtures (no live site)

- [x] CI fails if `packages/graph-runner` fixture tests fail (`pnpm test` runs them)
- [x] Replay fixtures from recorded HTML/HAR (`packages/graph-runner/fixtures`)
- [x] Runner has zero Camofox imports

**Done when:** the runner’s tests pass in CI on fixture data only.

---

## Chapter 6 — First catalog endpoint (`carrier_x_pod`)

Spec: [PROJECT.md §10](./PROJECT.md#10-reference-connector-carrier-x-pod).

### 6.1 Manifest and graph

- [x] `connectors/carrier_x_pod` manifest (inputs, outputs, pre-flight, cache, failure codes)
- [x] Manifest CI linter + meta-schema
- [x] Graph `v1.0.1-g2` checked in
- [x] Pre-flight: `destination_zip` required only when a POD is requested and there is no `session_id`

### 6.2 Staging fixtures (all green)

- [x] CI runs the seven `carrier_x_pod` cases (`packages/graph-runner` tests)

- [x] `not_found_timeline` → succeeded, `NOT_FOUND`
- [x] `in_transit` → succeeded, no document
- [x] `exception` → succeeded, `EXCEPTION`
- [x] `delivered_no_doc` → succeeded, `DELIVERED`, no blob
- [x] `delivered_zip_gate` → document URL
- [x] `delivered_vault_session` → document URL, no zip
- [x] `challenge_wall` → `blocked`, `CHALLENGE_REQUIRED`

### 6.3 Cache policy

- [x] TTL differs by status (`DELIVERED` vs `IN_TRANSIT` vs `NOT_FOUND`)
- [x] `document_url` is never stored as a long-lived cache value; signing happens on read
- [x] `include_pod_document` and `session_generation` are part of the cache key

**Done when:** all seven fixtures pass in CI and a cached status read does not enqueue a worker.

---

## Chapter 7 — Live worker (Camoufox)

**Local engine check (before this chapter):** [CAMOUFOX.md](./CAMOUFOX.md). Production worker uses **`camoufox-js`** (latest) in `apps/worker`.

### 7.1 Process boundary

- [x] Camofox launches only inside `apps/worker`
- [x] Gateway image/process has no browser binary
- [x] Proxy settings come from the connector profile (datacenter first, residential fallback)
- [x] Sticky proxy when the session is bound to an egress IP
- [x] Tear down the browser on success, failure, cancel, and timeout

### 7.2 One real path

- [x] One happy-path live run against the real target (or a staging mirror) for tracking status
- [x] Captcha or challenge returns `blocked` / `CHALLENGE_REQUIRED` (no blind retry loop)
- [x] Timeouts surface as `TARGET_TIMEOUT` or `GRAPH_STEP_FAILED` as specified

**Done when:** a live status job and a fixture job share the same API response shape.

The “live” run uses the checked-in staging mirror (`connectors/carrier_x_pod/staging/tracking.html`), because the graph URL is `https://carrier.example/tracking`, which is not a real site. The roadmap allows a staging mirror.

---

## Chapter 8 — Sessions, locks, and files

### 8.1 Vault (multi-tenant)

- [x] Postgres `sessions` rows scoped to `(tenant_id, connector_id, session_id)`; ciphertext at rest (AES-256-GCM + KMS)
- [x] Clients pass **`session_id` only** — never raw cookies in `POST /v1/jobs`
- [x] Gateway validates API key → tenant and that `session_id` belongs to that tenant; **decrypt only on the worker**
- [x] Warm Camofox pool per worker machine; **one isolated browser context per job** with `storageState` injected
- [x] After job: `storageState()` → re-encrypt → update row; bump `session_generation` when session identity changes
- [x] Always `context.close()` before the worker handles another tenant
- [x] Dead session → `SESSION_EXPIRED` and a clear reauth action for ops

### 8.2 Locks

- [x] Redis lock: `read_shared` only when the manifest allows it
- [x] Vault writes upgrade to `exclusive` (prevents two jobs corrupting the same row)
- [x] Ordering flows default to `exclusive`
- [x] Integration test: two tenants, two concurrent jobs — no cross-tenant cookies (separate contexts)

### 8.3 Artifacts

- [x] Intercept the download stream in the worker
- [x] Store the file in S3; never return the vendor’s temporary URL
- [x] Gateway mints a short-lived signed `document_url` (~15 minutes)
- [x] Bad zip gate → `ARTIFACT_GATE_FAILED` (not a repair-lane event)

**Done when:** a POD request with a valid session returns a signed URL, and a second status poll can be served from cache without a new file upload.

Vault ciphertext uses AES-256-GCM with `VAULT_DATA_KEY` (32 bytes, base64, in `.env`). That local key stands in for KMS. The gateway never decrypts session state.

---

## Chapter 9 — MCP (same jobs, agent-shaped)

### 9.1 Tools

- [x] `shadow_start_workflow`
- [x] `shadow_get_job_status`
- [x] `shadow_get_job_result`
- [x] `shadow_cancel_job`
- [x] `shadow_list_connectors`
- [x] Tools call `packages/core` / gateway services — no second job implementation
- [x] Descriptions tell the agent to poll; no tool holds the connection for the whole browser run

### 9.2 Safety

- [x] Idempotency key on start
- [x] `blocked` is explicit (human must fix access)
- [x] Schemas reject invented fields before enqueue

**Done when:** an MCP client can complete the same `carrier_x_pod` flow as curl.

---

## Chapter 10 — Developer portal

### 10.1 Next.js app

- [x] Sign-in for tenant users (not API keys in the browser for server-to-server calls)
- [x] Create and revoke API keys
- [x] Connector catalog page with inputs/outputs in plain language
- [x] Link or embed OpenAPI / quickstart (start → poll → result)
- [x] Usage view: cached reads vs live runs (counts can be rough before a payment provider)

**Done when:** a new tenant can create a key and call `POST /v1/jobs` using only the portal docs.

---

## Chapter 11 — Billing and fairness

### 11.1 Plans (local billing gateway)

- [x] Subscription tiers (developer, agency, enterprise — limits can start simple)
- [x] Meter cached reads separately from live runs
- [x] Failed live attempts that consumed a worker are metered honestly
- [x] Overages or hard caps so one tenant cannot burn the proxy pool

### 11.2 Rate limits

- [x] Redis limits per API key and per connector
- [x] `RATE_LIMITED` is a stable error, not a 500

**Done when:** a tenant over the live quota is rejected or billed before a worker starts.

Plan changes go through the local billing route `POST /v1/billing/plan`. There is no payment provider.

---

## Chapter 12 — Stay fast at ~2000 clients

### 12.1 API tier

- [x] More than one gateway replica behind a load balancer
- [x] Health checks; deploy does not drop in-flight polls
- [x] Status reads prefer Redis/Postgres indexes on `(tenant_id, job_id)`
- [x] No Camofox, no large file bytes, in the gateway process

### 12.2 Worker tier

- [x] Worker count scales with queue depth
- [x] Per-tenant and per-connector concurrency caps
- [x] Proxy pool exhaustion returns `PROXY_UNAVAILABLE`
- [x] Cancel is best-effort and frees the lock

### 12.3 Observability

- [x] Trace or log `job_id` from gateway to worker
- [x] Dashboards: queue depth, cache hit rate, p95 poll latency, live job duration, failure codes
- [x] Alert on queue delay and error-rate spikes per connector

**Done when:** a load test of status polls stays fast while live jobs are saturated in the worker pool.

---

## Chapter 13 — Studio (after the catalog endpoint earns it)

### 13.1 Dashboard and account

- [x] Tenant sign-up and sign-in to the **dashboard** (Chapter 10 portal can grow into this)
- [x] Studio entry only for roles allowed to author connectors
- [x] Catalog-only tenants can use API keys without Studio

### 13.2 Embedded browser and vault

- [x] Embedded **Camofox** in Studio for recording (tenant’s own session; isolated from other tenants)
- [x] Save vault session for connector after login/MFA; never mix cookies across tenants
- [x] Optional VNC path for edge cases; same isolation rules

### 13.3 Multi-step workflows (multiple URLs)

- [x] Record **more than one URL** per connector (e.g. `/tracking` then `/result?tracking=123`)
- [x] Graph steps: navigate, fill, click, wait, branch, extract — not “one bookmark = one API”
- [x] Publish yields **one** public job endpoint per connector; internal steps stay internal

### 13.4 Post-submit patterns (P1 / P2 / P3)

- [x] **P1 — same page / SPA:** wait for DOM or network signal without relying on URL change
- [x] **P2 — query parameter:** wait for URL/query match (`?id=`, `?tracking=`, etc.)
- [x] **P3 — path navigation:** wait for new path (`/result/123`, `/result?tracking=123`)
- [x] Graph compiler stores which branch(es) apply; runner implements all three
- [x] Fixture or staging case per pattern used by `carrier_x_pod` (or second connector)

### 13.5 Publish

- [x] Define inputs and outputs; publish manifest version
- [x] Compile graph JSON with pinned `graph_version`
- [x] Staging replay must pass before production promote

### 13.6 Human access and safety

- [x] Time-boxed privileged access, RBAC, audit row for vault onboarding
- [x] Customers who only buy a catalog endpoint never see Studio

**Done when:** a tenant can record a two-URL tracking flow, handle at least one P1/P2/P3 outcome, publish, and run it via `POST /v1/jobs` without hand-editing production JSON.

Studio recording is the portal form (two URLs plus P1, P2, or P3). It compiles graph `v1.0.0-g1` and replays it before insert. The optional VNC path is off. Vault rows stay on that tenant’s key. Author access lasts 24 hours (`author_until`).

---

## Chapter 14 — Repair lane

- [x] `GRAPH_STEP_FAILED` stores an accessibility snapshot and the last good graph version
- [x] LLM proposes a diff **offline** (not on the request path)
- [x] Human approves in the UI
- [x] Staging fixtures run before promote
- [x] `connector_version` stays put when only the graph changes
- [x] Wrong zip, captcha, and validation errors never enter this lane

**Done when:** a broken selector can be fixed, replayed, and promoted without an outage of the public schema.

The diff proposer is local and offline. `POST /v1/jobs` does not call it. An author approves the row on `/repairs` after staging replay. `graph_version` moves forward and `connector_version` stays the same.

---

## Chapter 15 — Second connector and operations

- [x] Second vertical connector copied from the `carrier_x_pod` template (manifest, fixtures, cache, failure codes)
- [x] Per-connector runbook: session renewal, challenge, quarantine, customer note when `graph_version` changes
- [x] Allowlisted `target_domains` enforced (no arbitrary URL from a client)
- [x] PII fields from the manifest redacted in logs

**Done when:** connector two ships without a new architecture, and on-call has a written playbook for connector one.

`warehouse_x_receipt` uses the same job API and fixture runner. The carrier playbook is [runbooks/carrier_x_pod.md](./runbooks/carrier_x_pod.md).

---

## Chapter 16 — Launch

- [ ] Production Postgres, Redis, S3, worker fleet, gateway replicas
- [ ] Backups and a restore drill for Postgres
- [ ] Secrets in a manager, not in git
- [ ] Status page or equivalent for API availability (not vendor-site uptime)
- [ ] Design partners on one vertical calling the real endpoint
- [ ] Public docs describe endpoints only — no browser/runtime in customer copy

**Done when:** a paying or committed tenant runs production jobs, cache and live meters are real, and Chapter 6 fixtures still pass in CI.

---

## Suggested order (one glance)

| Order | Chapter | You can demo |
|------|---------|----------------|
| 1 | Repository | Local gateway + worker boot |
| 2 | Data + core | State machine tests |
| 3 | Public API | curl start/poll/result |
| 4 | Queue | Live path with a fake result |
| 5–6 | Runner + `carrier_x_pod` | Seven fixtures green |
| 7–8 | Camofox, vault, files | One real POD or status |
| 9 | MCP | Agent uses the same contract |
| 10–11 | Portal + plans | Key, docs, meters |
| 12 | Scale | Polls stay fast under load |
| 13–14 | Studio + repair | Safe graph updates |
| 15–16 | Second connector + launch | Second endpoint, real tenants |

---

## Related docs

| Doc | Role |
|-----|------|
| [OVERVIEW.md](./OVERVIEW.md) | What customers see |
| [PROJECT.md](./PROJECT.md) | Spec, manifests, reference connector |
| [POTENTIAL.md](./POTENTIAL.md) | What moves the idea from 7.5 to 9 |
| [README.md](../README.md) | Repo entry |
