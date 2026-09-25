# Build progress (vs ROADMAP)

Honest snapshot against [ROADMAP.md](./ROADMAP.md). Update when a chapter’s **Done when** is fully satisfied.

Last updated: 2026-09-25

| Chapter | Status | Notes |
|---------|--------|--------|
| **1** Repository & local platform | **Done** | Monorepo, ESLint, docker-compose (host ports **5436** / **6382**), CI lint/typecheck/test/build. Graph-runner fixture CI gate is Chapter 5. |
| **2** Data model & core | **Done** | Schema + migrations; core unit tests; worker writes `usage_events` on successful stub runs. |
| **3** Public API | **Done** | Create, poll, cancel, auth, OpenAPI, failure examples, integration tests (isolation, idempotency, validation, poll, 409 result, cancel). Succeeded result after a live run is Chapter 4. |
| **4** Queue & fake worker | **Done** | Live enqueue, Redis cache hits skip the queue, stub success JSON, forced failed/blocked, tenant concurrency, retry does not double-write a finished job. |
| **5** Graph runner & fixtures | **Done** | Versioned graph JSON, P1/P2/P3, fixture HTML/HAR replay, no Camoufox. The seven `carrier_x_pod` cases are Chapter 6. |
| **6** `carrier_x_pod` | **Done** | Manifest, graph `v1.0.1-g2`, seven fixtures, cache policy, gateway pre-flight. |
| **7** Live worker (Camoufox) | **Done** | `camoufox-js` only in `apps/worker`. Staging mirror happy path returns `{ status: "IN_TRANSIT" }` with graph `v1.0.1-g2`. Challenge is `blocked` / `CHALLENGE_REQUIRED`. Slow page is `TARGET_TIMEOUT`. Context closes in `finally`. |
| **8** Sessions, locks, files | **Done** | AES-256-GCM vault (`VAULT_DATA_KEY` stands in for KMS). Worker decrypts `storageState`, re-encrypts after the job, bumps `session_generation` when cookies change. Expired session is `SESSION_EXPIRED`. Redis exclusive lock on vault writes. POD bytes go to MinIO; gateway presigns `document_url` for 15 minutes. Cached status reads do not upload again. |
| **9** MCP | **Done** | `POST /mcp` tools call the existing `/v1` routes. Start returns immediately and tells the agent to poll. Same idempotency key returns the same job. Invented fields are `VALIDATION_ERROR` and do not enqueue. |
| **10** Developer portal | **Done** | Next.js app on port 3001. Email sign-in uses an httpOnly session cookie. API keys are created and revoked in the portal and shown once. Catalog, quickstart (`POST /v1/jobs` then poll then result), and cached vs live usage counts. |
| **11** Billing and fairness | **Done** | Plans developer (10), agency (100), enterprise (1000) live runs per month. Over the cap returns 429 `RATE_LIMITED` before enqueue. Cached reads do not use the live cap. Failed and blocked worker runs are metered as live. Redis limits 60 requests per minute per API key and per connector. `POST /v1/billing/plan` is a local stand-in that sets the tenant plan. No payment provider is wired. |
| **12** Stay fast at ~2000 clients | **Done** | Nginx on port 3080 balances gateway replicas on 3000 and 3010 (`pnpm dev:gateways`). `pnpm dev:workers` starts `WORKER_COUNT` processes. Connector cap `CONNECTOR_CONCURRENCY` (default 4). Invalid proxy URL fails as `PROXY_UNAVAILABLE`. Cancel deletes the session lock. `GET /v1/metrics` reports queue depth, cache hits, p95 poll and live duration, and failure codes, and logs `alert queue_delay` or `alert error_rate` past fixed thresholds. Status poll p95 stayed under 200ms while a tenant job was running. |
| **13** Studio | **Done** | Portal role `author` or `catalog`. Authors (24-hour `author_until`) see `/studio` and publish `studio_tracking` after a P1/P2/P3 staging replay. Catalog tenants keep API keys and never see Studio. Publish writes a tenant vault row and a `vault_onboarding` audit row. The worker runs the published graph and returns its outputs. VNC stays off. |
| **14** Repair lane | **Done** | `GRAPH_STEP_FAILED` stores an accessibility snapshot, the last good graph version, and a local offline diff. Challenge, bad zip, and validation errors do not. An author approves on `/repairs` after staging replay. `graph_version` changes and `connector_version` stays. |
| **15** Second connector and operations | **Done** | `warehouse_x_receipt` ships with a manifest, graph, fixtures, cache fields, and failure codes on the same runner. [runbooks/carrier_x_pod.md](./runbooks/carrier_x_pod.md) covers session renewal, challenge, quarantine, and the customer note when only the graph changes. Client URLs must match `target_domains`. Worker input logs redact `destination_zip`. |
| **16+** | **Not started** | See ROADMAP. |
