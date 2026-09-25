# Build progress (vs ROADMAP)

Honest snapshot against [ROADMAP.md](./ROADMAP.md). Update when a chapter’s **Done when** is fully satisfied.

Last updated: 2026-09-25

| Chapter | Status | Notes |
|---------|--------|--------|
| **1** Repository & local platform | **Done** | Monorepo, ESLint, docker-compose (host ports **5433** / **6380**), CI lint/typecheck/test/build. Graph-runner fixture CI gate is Chapter 5. |
| **2** Data model & core | **Done** | Schema + migrations; core unit tests; worker writes `usage_events` on successful stub runs. |
| **3** Public API | **Done** | Create, poll, cancel, auth, OpenAPI, failure examples, integration tests (isolation, idempotency, validation, poll, 409 result, cancel). Succeeded result after a live run is Chapter 4. |
| **4** Queue & fake worker | **Done** | Live enqueue, Redis cache hits skip the queue, stub success JSON, forced failed/blocked, tenant concurrency, retry does not double-write a finished job. |
| **5** Graph runner & fixtures | **Done** | Versioned graph JSON, P1/P2/P3, fixture HTML/HAR replay, no Camoufox. The seven `carrier_x_pod` cases are Chapter 6. |
| **6** `carrier_x_pod` | **Done** | Manifest, graph `v1.0.1-g2`, seven fixtures, cache policy, gateway pre-flight. |
| **7+** | **Not started** | See ROADMAP. |
