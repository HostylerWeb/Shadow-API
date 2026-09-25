# ShadowAPI — Project Master Document

**Stealth Web-to-REST & MCP Gateway**

Version: 1.0 (architecture & product spec)  
Status: Pre-implementation — `carrier_x_pod` v1.0.1 release candidate defined  
Last updated: 2026-09-25

> **New readers:** If you want a non-technical explanation (what the product does, build vs buy connectors, integrating into apps), read **[OVERVIEW.md](./OVERVIEW.md)** first. This document is the full technical and product specification for implementers.

---

## Table of contents

0. [Product summary (technical)](#0-product-summary-technical)

1. [Executive summary](#1-executive-summary)
2. [Problem & opportunity](#2-problem--opportunity)
3. [Product vision & strategic pivots](#3-product-vision--strategic-pivots)
4. [Who it is for](#4-who-it-is-for)
5. [Core architecture](#5-core-architecture)
6. [Platform components](#6-platform-components)
7. [Execution lifecycle](#7-execution-lifecycle)
8. [Async API & MCP integration](#8-async-api--mcp-integration)
9. [Connector manifest system](#9-connector-manifest-system)
10. [Reference connector: Carrier X POD](#10-reference-connector-carrier-x-pod)
11. [Reliability, caching & session model](#11-reliability-caching--session-model)
12. [Repair lane (LLM off the critical path)](#12-repair-lane-llm-off-the-critical-path)
13. [Risk register (summary)](#13-risk-register-summary)
14. [Security & compliance](#14-security--compliance)
15. [Monetization & unit economics](#15-monetization--unit-economics)
16. [Competitive positioning](#16-competitive-positioning)
17. [Implementation roadmap](#17-implementation-roadmap)
18. [Glossary](#18-glossary)

---

## 0. Product summary (technical)

ShadowAPI is a **platform** and optionally a **catalog vendor**:

| Capability | Description |
|------------|-------------|
| **Studio** | Customers and operators record browser workflows, define input/output schemas, and publish **connectors**. |
| **Runtime** | Hosted execution (stealth browser, sessions, proxies, queues) turns each API/MCP request into a **job** that runs the connector graph. |
| **Consumption** | Integrators call **REST** (`/v1/jobs`) or **remote MCP** from backends, SaaS products, mobile app servers, or AI agents. |
| **Catalog (GTM)** | ShadowAPI may sell **pre-built, SLA-oriented connectors** (e.g. logistics POD). Same platform powers them; positioning favors outcomes over “rent a browser.” |

**Integration pattern for app/web platforms:** The end-user UI talks only to **your** backend; your backend starts ShadowAPI jobs, polls for completion, and returns normalized data to the client. No embedded browser in the mobile or web frontend.

**Not in scope as a promise:** Arbitrary URLs with zero setup, bypassing site terms, or fully unattended operation when the target requires new human verification.

---

## 1. Executive summary

**ShadowAPI** is a visual middleware and runtime that turns anti-bot-protected, legacy, or non-API web portals into **production-grade REST endpoints** and **remote Model Context Protocol (MCP) tools** for software backends and AI agents (Cursor, Claude, LangChain, etc.).

Unlike generic browser automation platforms, ShadowAPI sells **outcome-backed connectors** (e.g. “Carrier X POD API”) with versioned execution graphs, operational playbooks, and SLA-oriented runtime policy—not “bring your own scraper.”

**Technology (decided):**

Clients only call a thin **control plane** (REST + MCP). Live browser work runs on a **separate worker fleet** so polls and cache hits stay fast even with thousands of tenants.

| Layer | Choice |
|-------|--------|
| Language | **TypeScript** monorepo (pnpm) |
| Public API + MCP | **Fastify** on the **latest stable Node.js** — validates, enqueues, reads status; returns in milliseconds |
| Versions | **Latest stable of every runtime, image, and library** when added or upgraded (Node, pnpm, TypeScript, Fastify, PostgreSQL, Redis, BullMQ, Next.js, Docker images). Lockfiles record that latest. See [ROADMAP.md](./ROADMAP.md). |
| Shared domain | `packages/core` — job state machine, manifest/pre-flight validation, cache keys |
| Graph logic | `packages/graph-runner` — deterministic steps, tested on fixtures without a browser |
| Database | **PostgreSQL** — tenants, API keys, jobs, connector versions, usage, audit |
| Queue, locks, rate limits, hot cache | **Redis** + **BullMQ** |
| Artifacts | **S3-compatible** object storage; gateway issues short-lived signed URLs |
| Live execution | **Worker** process only — Camofox, proxies, graph runner. Never inside API replicas |
| Customer portal / Studio (later) | **Next.js** |
| Billing | Local plan gateway (`POST /v1/billing/plan`) plus metered **cached** vs **live** runs. No payment provider yet. |

**How it stays responsive (~2000 clients):** most requests are validation, Redis cache hits, or Postgres status reads. API replicas scale horizontally. Workers scale on queue depth, with per-tenant and per-connector concurrency caps. Idempotency keys stop duplicate live runs. Cache-first reads (`run_mode: cached`) avoid a browser when the manifest TTL allows it.

**Runtime concepts (unchanged):**

- **Camoufox** — [Camoufox](https://github.com/daijro/camoufox) engine (official binary via `camoufox-js` / `camoufox fetch`); fingerprint and proxy alignment on the worker. Local setup: [CAMOUFOX.md](./CAMOUFOX.md)
- **Accessibility snapshots** — for Studio and the offline repair lane, not the hot path
- **Deterministic graphs** — JSON steps; no LLM on live requests
- **Session vault** — encrypted cookies/`localStorage`; KMS; `session_generation` in cache keys
- **Async MCP** — same job service as REST: start → poll → result

---

## 2. Problem & opportunity

| Pain | Why incumbents fail |
|------|---------------------|
| **Integration bottleneck** | Enterprise logistics, insurance, procurement, and government sites have no public REST APIs |
| **Scraper blocks** | Playwright/Puppeteer/Selenium trip Cloudflare Turnstile, Akamai, DataDome |
| **Fragile selectors** | CSS/DOM changes break custom scrapers weekly |
| **AI agent isolation** | Agents struggle with live navigation, sessions, captchas, and multi-step B2B flows |

**Opportunity:** Package **maintained, schema-stable integrations** as APIs and MCP tools, with ops-owned session/proxy/heal playbooks per target—not another headless browser rental.

---

## 3. Product vision & strategic pivots

These pivots follow technical review of the original “generic stealth infra” pitch. They are **foundational** to the product.

### 3.1 GTM: outcomes over infrastructure

- **Public positioning** de-emphasizes “rent headless browsers / build any scraper” (margin war with Browserbase, Skyvern, raw Playwright).
- **Sell** SLA-backed, **versioned connectors** per vertical: e.g. `carrier_x_pod`, payer eligibility, dealer inventory.
- **Platform remains dual-use:** Developers and agencies can still **author their own connectors in Studio** and embed them in **their** apps or client projects; GTM focuses on **maintained catalog + ops playbooks** as the differentiator.
- **Moat:** connector library + session longevity per domain + proxy/quarantine playbooks + graph versioning—not fingerprint marketing alone.

### 3.2 Architecture: asynchronous MCP & REST jobs

- Long browser workflows (**15–120s+**) must **not** map to a single synchronous MCP `tools/call` (host timeouts, broken SSE, duplicate retries).
- Pattern: **`start_workflow` → `poll_status` → `get_result`** (and optional `cancel`).
- Every tool call returns in **seconds**; browser work runs on the **BullMQ** worker fleet (Redis).

### 3.3 Reliability: LLM in the repair lane only

- **Runtime** executes **deterministic, versioned graphs** recorded in Studio.
- On step failure: **offline heal event** → proposed graph diff → **human validation** → promote to staging → replay suite → prod.
- LLM uses accessibility trees for **repair proposals**, not per-request navigation.

### 3.4 Unit economics: cached reads vs live browser

- PLG tier cannot subsidize **1,000 full live sessions/month** at low price once proxy + compute are included.
- Meter **cached reads** (inventory/status) separately from **live browser runs**; aggressive caching where business rules allow; overages on heavy usage.

---

## 4. Who it is for

| Segment | Use case (technical) | Plain-language role |
|---------|----------------------|---------------------|
| **Backend engineers** | `POST /v1/jobs` with stable JSON in/out | Wire ShadowAPI into APIs that power web and mobile products |
| **Product teams** | Connectors as features (“track shipment in our dashboard”) | Replace manual ops or one-off scripts with a managed flow |
| **AI agent builders** | Remote MCP tools with predictable async semantics | Let agents call **approved** workflows safely |
| **Ops / integration teams** | Maintained connectors instead of in-house scrapers | Own uptime when a vendor changes their portal |
| **Agencies** | Multi-connector deployments with proxy management | Build and host connectors for multiple clients |

**Two customer paths (see [OVERVIEW.md § Two ways](./OVERVIEW.md#two-ways-customers-use-the-product)):**

1. **Subscribe to pre-built connectors** — integrate like any third-party API.  
2. **Build in Studio** — publish private or custom connectors for internal or client platforms.

**Target verticals (examples):**

- Logistics & freight — POD, tracking, BOL
- Wholesale & automotive — gated dealer stock and ordering
- Healthcare & insurance — eligibility, claim status on legacy portals
- Procurement — government RFP monitoring
- Enterprise IT — internal apps without APIs for agent tooling

---

## 5. Core architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CLIENT CONSUMPTION                                   │
│     [ REST API ]              [ AI Agent — Remote MCP (SSE/HTTP) ]           │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         SHADOW API GATEWAY                                   │
│  API keys & rate limits │ Request queue │ Schema / pre-flight validation     │
│  Job store & state machine │ Cookie/session vault (AES-256) │ Blob storage   │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      CAMOFOX EXECUTION ENGINE                                │
│  Stealth Firefox │ Proxy pool + sticky session │ A11y snapshot (Studio)      │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    DETERMINISTIC GRAPH RUNNER (runtime)                      │
│  Versioned steps │ Locks (read_shared / exclusive) │ Artifact intercept      │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                    (on sustained failure)
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         REPAIR LANE (offline)                                │
│  LLM + a11y diff proposal │ Ops approve │ Staging replay │ graph_version bump │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      TARGET PROTECTED PORTAL                                 │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Platform components

### 6.1 Shadow API Gateway

- Authenticates API keys; enforces per-key and per-connector rate limits
- Validates job inputs against **connector manifest** (`input_schema` + `pre_flight_validation`)
- Enqueues work; exposes job state machine: `queued` → `running` → `succeeded` | `failed` | `cancelled` | `blocked`
- Manages **session vault** encrypt/decrypt; coordinates **session locks**
- Stores job results; issues **short-lived signed URLs** for PDFs/images (never expose carrier temp URLs to clients)

### 6.2 Camofox execution engine

- Firefox-based browser with **C++-level fingerprint spoofing** (canvas, WebGL, audio, fonts, etc.) vs fragile JS patches
- **Residential / datacenter proxy** strategies per connector manifest
- **Sticky proxy** per session where cookies bind to egress IP
- **Geo / timezone / WebRTC** alignment with proxy exit where required
- Resource blocking (images, analytics) to cut bandwidth and detection surface

### 6.3 Studio (build phase)

**Audience:** Tenants who **build** connectors — after dashboard sign-in. Catalog subscribers who only call pre-built endpoints may never open Studio.

**Dashboard flow:**

1. User creates an account and signs in to the **tenant dashboard**.  
2. In **Studio**, they use an **embedded Camofox** session (preview) to use the target site like a human — login, MFA, and consent once; state is stored in the **vault** for that tenant + connector, isolated from other tenants.  
3. They **record a multi-step workflow**, not a single URL. A connector graph may include several navigations (e.g. `https://domain.com/tracking` → submit parcel number → land on `https://domain.com/result?tracking=123` or `/result/123`).  
4. They define **inputs** and **outputs**, compile an **execution graph**, and **publish**.  
5. Integrators get **one public endpoint per connector** (`POST /v1/jobs` + `connector_id`); internal URLs and steps are not part of the customer API.

**Studio capabilities:**

- Embedded Camofox (and/or VNC where needed) for human navigation, MFA, and consent flows  
- Record interactions across **multiple pages and URLs** in one graph  
- Define **input variables** and **output fields** per step where needed  
- Compile to **execution graph** (JSON); pin **`graph_version`** separate from **`connector_version`**  
- Emit low-token **accessibility snapshots** for element binding in graphs  
- **Publish** a connector manifest so runtime and API validation match what integrators send from their apps  

#### 6.3.1 Post-submit navigation patterns (tracking and similar flows)

Recording must support how real sites show results after a search (e.g. parcel number on a tracking page). Treat these as first-class **graph branches**, not as “one URL per connector”:

| ID | Pattern | Detection (examples) | Graph implications |
|----|---------|----------------------|-------------------|
| **P1** | **Same document** | URL unchanged (or hash-only); result appears via JS/DOM update or XHR/fetch | Wait for selector or network idle; extract outputs from DOM or intercepted API |
| **P2** | **Query change** | Path stable; query string added or updated (`?id=123`, `?tracking=123`) | `waitForURL` / URL pattern step; then extract on new document state |
| **P3** | **Path navigation** | New path or route (`/result/123`, `/result?tracking=123`) | Explicit navigate or `waitForURL` after submit; may be full document load |

Example chain (all valid in one connector):

```
  [Navigate] https://domain.com/tracking
  [Fill]     parcel_number → #tracking-input
  [Click]    submit
  [Branch]   P1 | P2 | P3  →  [Extract] status, dates, POD link
```

Fixtures and staging replay should cover at least one connector step graph per pattern where the target vertical uses it (see `carrier_x_pod` branches in §10).

### 6.4 Session & cookie vault

- One-time human login / 2FA in VNC; persist cookies and relevant `localStorage`
- Per-tenant encryption (KMS); **session_generation** counter on refresh/login
- **Invalid/expired session** → job `blocked` or `SESSION_EXPIRED` + `user_action: reauth_vnc`

Integrators **never** send cookies or storage in API requests. They send an optional **`session_id`** (or use public-only inputs such as tracking + zip). The API key identifies the **tenant**; the vault row is always scoped to **tenant + connector** (and `session_id`).

#### 6.4.1 Multi-tenant isolation flow

Every authenticated job is tied to one tenant via the API key. When a job needs a logged-in portal, the **worker** (not the poll-heavy gateway) loads that tenant’s vault row, decrypts it, runs in an isolated browser context, then optionally writes refreshed state back.

```
Client                    Gateway                         Worker (Camofox)
  │                          │                                  │
  │  POST /v1/jobs           │                                  │
  │  Bearer: api_key         │  validate key → tenant_id        │
  │  session_id (optional)   │  verify session belongs to tenant │
  │                          │  enqueue job (no cookie bytes)   │
  │                          ├─────────────────────────────────►│
  │                          │                                  │  decrypt vault row
  │                          │                                  │  newContext(storageState)
  │                          │                                  │  run graph
  │                          │                                  │  storageState() → re-encrypt
  │                          │                                  │  context.close()
  │  GET /v1/jobs/:id        │  read status from Postgres/Redis │
  │◄─────────────────────────┤                                  │
```

**1. Vault mapping (Postgres)**

Primary store is **`sessions`** in PostgreSQL (not Redis). Redis holds locks and queue metadata only. Example logical row:

```json
{
  "session_id": "sess_abc",
  "tenant_id": "org_99812",
  "connector_id": "carrier_x_pod",
  "session_generation": 3,
  "encrypted_storage_state": "<AES-256-GCM ciphertext of Playwright/Camofox storageState JSON>",
  "proxy_sticky_key": "optional — egress binding when cookies tie to IP",
  "updated_at": "..."
}
```

Ciphertext only at rest. Per-tenant data keys via KMS (or equivalent). API responses and job payloads never include `encrypted_storage_state`.

**2. Request path (gateway)**

On `POST /v1/jobs`:

- Validate Bearer API key → `tenant_id`.
- If `session_id` is present, assert the row exists for `(tenant_id, connector_id, session_id)` before enqueue.
- Do **not** decrypt vault material on the gateway for routine starts (keeps secrets off API replicas and off cache-only code paths).
- Enqueue `{ job_id, tenant_id, connector_id, inputs, session_id?, run_mode }`.

Poll and result endpoints only read job state; they never touch the vault.

**3. Browser context isolation (worker)**

Do not cold-start a new browser **executable** per job (too slow). Run a **pool of warm Camofox processes** per worker machine. For each job:

- Acquire manifest-appropriate **session lock** (`read_shared` or `exclusive`).
- Decrypt storage state in worker memory only.
- `browser.newContext({ storageState, … })` — a strict incognito-like context: **no shared cookies, cache, or storage** with other contexts on the same host.
- Apply Camofox fingerprint + manifest proxy profile on that context.
- Execute the graph on `context.newPage()`.

Two tenants at the same millisecond → two contexts (or two workers), two decrypted states, no shared memory for auth data.

**4. Write-back and teardown**

Portals rotate CSRF tokens, extend cookies, or refresh sessions during use.

- After the graph completes (success or terminal failure that still touched the session), call `context.storageState()` when the manifest marks the connector as mutating session state.
- Re-encrypt and `UPDATE` the vault row; bump **`session_generation`** when login/session identity changes (invalidates cache keys per §11.1).
- Vault updates require **`exclusive`** lock; parallel reads use `read_shared` only when the manifest documents evidence.
- Always `context.close()` (and drop page references) before the worker picks up unrelated tenant work.

**5. What clients experience**

They call the same endpoint whether or not a vault session exists. Catalog users see only **API key + inputs + optional `session_id`** in the docs — not browsers, contexts, or cookie JSON.

### 6.5 Graph runner (runtime)

- Strict step order; branching on DOM/network signals normalized to business enums
- After “submit” steps, resolve **P1 / P2 / P3** navigation outcomes (§6.3.1) before extraction — do not assume a single fixed URL
- **Concurrency:** `read_parallel` + `session_lock_mode: read_shared` only with evidence; **exclusive** upgrade for vault writes
- Intercept XHR/fetch for artifact URLs; stream to internal blob storage
- Map terminal state to **output_schema**; apply **cache_policy** on success

### 6.6 Remote MCP server

- Tools: `shadow_start_workflow`, `shadow_get_job_status`, `shadow_get_job_result`, `shadow_cancel_job`, `shadow_list_connectors`
- Tool descriptions instruct agents to poll until `result_ready` or terminal failure
- **Idempotency keys** on start to survive agent retries

---

## 7. Execution lifecycle

### 7.1 Build phase (Studio)

1. Tenant user signs in to the dashboard; opens Studio with **embedded Camofox** (tenant-isolated session / vault as needed)
2. Records **all steps and URLs** in the flow (e.g. tracking page → result page), including which **P1 / P2 / P3** pattern applies after submit
3. Defines inputs (e.g. `tracking_number`, `include_pod_document`) and outputs (`status`, `document_url`)
4. Binds steps to stable selectors / a11y refs; compiles graph
5. Publishes **connector manifest** + **graph_version** to registry
6. Runs **staging replay fixtures** (per pattern where relevant) before production promote

### 7.2 Runtime phase

1. Client calls start (REST or MCP) with `connector_id`, `inputs`, optional `session_id`, `run_mode` (`live` | `cached`)
2. Gateway pre-flight validation (instant `VALIDATION_ERROR` on bad inputs — zero browser cost)
3. Job queued; worker assigns proxy, loads vault if needed, acquires locks
4. Graph executes; progress updates in job store
5. On success: structured JSON + metadata; optional signed `document_url`
6. On `blocked` / `CHALLENGE_REQUIRED`: human intervention path, no blind agent retry loop

**Latency expectation:** Many flows **15–120 seconds**; marketing “2–4s” applies only to cache hits or very short graphs.

---

## 8. Async API & MCP integration

### 8.1 Job state machine

| Status | Meaning |
|--------|---------|
| `queued` | Accepted, waiting for worker |
| `running` | Browser/graph active |
| `succeeded` | Result available |
| `failed` | Terminal error (`failure.code`) |
| `cancelled` | Best-effort cancel |
| `blocked` | Needs human (captcha, reauth) |

### 8.2 Failure codes (representative)

- `VALIDATION_ERROR` — pre-queue (malformed inputs)
- `SESSION_EXPIRED` — vault session dead
- `CHALLENGE_REQUIRED` — captcha / Turnstile
- `ARTIFACT_GATE_FAILED` — zip gate rejected (bad user input, not heal)
- `PROXY_UNAVAILABLE` — pool exhausted
- `TARGET_TIMEOUT` — site or step timeout
- `GRAPH_STEP_FAILED` — unexpected DOM/network (repair lane candidate)
- `RATE_LIMITED` — ShadowAPI or target throttling
- `INTERNAL_ERROR` — platform fault

### 8.3 Start workflow (conceptual)

**Request fields:** `connector_id`, `connector_version` (optional pin), `inputs`, `run_mode`, `session_id`, `idempotency_key`, `client_timeout_seconds`

**Response:** `job_id`, `status: queued`, `poll_after_ms`, `graph_version`

### 8.4 Polling contract

- Backoff: 2s → 5s → 10s (cap)
- `result_ready: true` → call get result
- `NOT_FOUND` and similar **business negatives** are often **`succeeded`** with enum in `outputs` (no retry storm)

### 8.5 REST parity

```
POST   /v1/jobs
GET    /v1/jobs/{job_id}
GET    /v1/jobs/{job_id}/result
DELETE /v1/jobs/{job_id}   # cancel
GET    /v1/connectors
```

---

## 9. Connector manifest system

Each connector is defined by a **ConnectorManifest v1** envelope (not a raw JSON Schema document at root). CI validates manifests with a dedicated linter + nested `input_schema` / `output_schema`.

### 9.1 Key manifest fields

| Field | Purpose |
|-------|---------|
| `connector_id` | Stable slug |
| `latest_version` / `versions` | API contract semver |
| `graph_version` | Execution graph pin (e.g. `v1.0.1-g2`) |
| `auth_mode` | `none` \| `optional_session` \| `required_session` |
| `session_required` | Whether job must pass `session_id` |
| `runtime_profile` | Concurrency, proxy, cache, rate limits |
| `pre_flight_validation` | Rules needing job context (e.g. session_id) |
| `input_schema` / `output_schema` | Agent-facing contracts |
| `operational_metadata` | PII fields, target domains, `not_found_is_success` |
| `supported_failure_codes` | Per-connector documented failures |

### 9.2 Concurrency & locks

| `concurrency_class` | `session_lock_mode` | Behavior |
|---------------------|---------------------|----------|
| `read_parallel` | `read_shared` or `none` | Parallel reads when evidence supports it |
| `exclusive` | `exclusive` | Serialize all use of session |

**Redlock semantics:** mutex **serializes**; parallel reads require **no lock** or **read_shared**, not “Redlock allows parallel.” Vault **writes** always **upgrade to exclusive**.

### 9.3 Pre-flight beyond JSON Schema

Example rule (job context):

- `destination_zip` required only when `include_pod_document === true` **and** `job.session_id` is absent

### 9.4 Cache policy

- `key_fields`: e.g. `tracking_number`, `destination_zip`, `session_generation`, **`include_pod_document`**
- `ttl_by_status`: different TTL for `DELIVERED` vs `IN_TRANSIT` vs `NOT_FOUND`
- `never_cache_fields`: e.g. `document_url` (regenerate signed URL on cache hit)
- `document_url_ttl_seconds`: shorter than status cache if needed

### 9.5 Proxy profile

- `strategy`: e.g. `datacenter_preferred` with `fallback: residential`
- `sticky_session_hours`, `preferred_providers`, `quarantine_triggers`
- **Blocked ASNs** live in ops DB per connector, not necessarily in customer manifest

### 9.6 Meta-schema

Publish `connector-manifest.json` at a stable `$schema` URL (e.g. `https://schemas.vanguard.dev/v1/connector-manifest.json`) for CI.

---

## 10. Reference connector: Carrier X POD

**ID:** `carrier_x_pod`  
**Purpose:** Proof of delivery — status, delivery metadata, optional POD PDF via signed URL.

### 10.1 Auth semantics

- **`auth_mode: optional_session`**
- Public: tracking status (`IN_TRANSIT`, `EXCEPTION`, timeline)
- POD / signature: **vault session** OR **`destination_zip`** challenge on public route
- **`include_pod_document`** boolean drives artifact path; conditional zip in schema + gateway rule when no `session_id`

### 10.2 Artifact delivery

- “View POD” triggers XHR (e.g. `/api/v1/pod/stream`) → temporary URL → PDF blob
- Graph intercepts stream, uploads to **internal blob storage**, returns **`document_url`** (signed, ~15 min)
- **`artifact_handling: store_and_sign`** — carrier URL never returned to client

### 10.3 NOT_FOUND

- HTTP 200 with empty timeline and `#error-message` (“No tracking information found”)
- Map to **`status: NOT_FOUND`**, job **`succeeded`**, `not_found_is_success: true`

### 10.4 Graph checklist (v1.0.1-g2)

1. **Pre-conditions** — validate inputs; `read_shared` lock if applicable  
2. **Navigate + anti-bot** — GET tracking site; on captcha → `blocked` + `CHALLENGE_REQUIRED`  
3. **Submit tracking** — fill `#tracking-input`, `#submit-btn`  
4. **Branch** — `NOT_FOUND` | `IN_TRANSIT` | `EXCEPTION` | `DELIVERED` (extract dates/`signed_by` on no-doc path)  
   - If `include_pod_document` but status ≠ `DELIVERED` → **ignore flag**, return success without blob steps  
5. **Gated artifacts** — valid `session_id` → skip zip; else if `include_pod_document` → zip + **submit**; bad zip → `ARTIFACT_GATE_FAILED`; invalid session → `SESSION_EXPIRED`  
6. **Blob** — click download; intercept XHR; **exclusive** lock if persisting vault; upload; sign URL  
7. **Complete** — release locks; `succeeded`

**Anti-bot guard** should also run **after submit** (step 3), not only on landing.

### 10.5 Staging replay fixtures

| Fixture | Expected |
|---------|----------|
| `not_found_timeline` | `succeeded`, `NOT_FOUND` |
| `in_transit` | `succeeded`, no `document_url` (even if `include_pod_document` true) |
| `exception` | `succeeded`, `EXCEPTION` |
| `delivered_no_doc` | `succeeded`, `DELIVERED`, timeline fields only |
| `delivered_zip_gate` | zip path → blob → `document_url` |
| `delivered_vault_session` | no zip; blob → `document_url` |
| `challenge_wall` | `blocked`, `CHALLENGE_REQUIRED` |

### 10.6 Freeze acceptance criteria (v1.0.1)

1. Manifest includes pre-flight zip/session rule, `store_and_sign`, cache key with `include_pod_document`  
2. All seven fixtures green on `graph_version: v1.0.1-g2`  
3. Integration test: `include_pod_document: true` + valid `session_id` + **no** `destination_zip` → validation pass + vault path

---

## 11. Reliability, caching & session model

### 11.1 Session generation

- Bump on login/refresh and on vault write-back when storage state materially changes; include in cache keys to prevent stale data after reauth
- Concurrent jobs for the same `session_id` must respect lock mode so two workers do not corrupt the same `encrypted_storage_state` row

### 11.2 Parallel reads

- Only with **`concurrency_evidence`** (load test notes + date) in manifest
- Downgrade to `exclusive` via patch version without renaming connector

### 11.3 Idempotency

- Same `idempotency_key` within TTL returns existing `job_id` when still active or completed

### 11.4 Writes vs reads

- Graph metadata: `concurrency_class` and lock mode per connector
- Submit/claim flows default **`exclusive`**

---

## 12. Repair lane (LLM off the critical path)

1. Runtime step fails with `GRAPH_STEP_FAILED` (not user input, not captcha)
2. System captures a11y snapshot + last known good graph version
3. LLM proposes element relocation / graph diff
4. Ops reviews diff in UI; runs **staging replay suite**
5. Promote new `graph_version`; **`connector_version`** unchanged if I/O schema unchanged

**Not for:** wrong zip (`ARTIFACT_GATE_FAILED`), captcha (`CHALLENGE_REQUIRED`), or validation errors.

---

## 13. Risk register (summary)

| Risk | L × I | Mitigation highlights |
|------|-------|------------------------|
| Domain-specific proxy burn | H × 4 | Sticky session; per-connector quarantine scores; datacenter-first; BYO proxy enterprise |
| Concurrent session invalidation | H × 4 | Session locks; generation counter; exclusive vault writes; read vs write concurrency classes |
| Anti-bot non-stationary | H × 4 | Versioned connectors; canaries; customer comms on bumps |
| Bad heal to prod | M × 5 | Human approve; staging replay; auto-rollback on error rate |
| Stale cache | M × 5 | TTL by status; session_generation in key; `live` run mode |
| MCP timeouts | M × 3 | Async-only tools; documented poll loop |
| Legal / ToS | M × 4 | Customer attestation; allowlisted domains in manifest |
| COGS on PLG | H × 3 | Cached vs live metering; overages; concurrency caps |

---

## 14. Security & compliance

- Encrypt vault at rest (AES-256, per-tenant keys / KMS)
- **PII fields** declared in manifest (`signed_by`, etc.) — redact in logs
- **`target_domains[]`** — SSRF guard for graphs and redirects
- No carrier credentials or temp URLs in client-visible responses
- API keys scoped per tenant; rate limits per key and connector
- VNC onboarding: RBAC, time-boxed access, audit trail
- Enterprise: data retention policies, regional egress options (roadmap)

---

## 15. Monetization & unit economics

| Tier | Indicative positioning |
|------|-------------------------|
| **Developer (~$49/mo)** | Few connectors; MCP calls cap; **cached reads** emphasized; live runs capped / overage |
| **Pro Agency (~$399/mo)** | More connectors; proxy management; higher live quota |
| **Enterprise ($1,500–$2,500+/mo)** | Custom connectors; dedicated proxies; private MCP instance; BYO proxy |

**Year 1 targets (from original briefing):** cash collected ~$160k–$220k; ARR exit ~$480k–$540k.

**Margin reality:** ~65% gross margin requires rare heals, cache hits on reads, overages, and honest metering of failed runs (retries burn proxy + compute).

---

## 16. Competitive positioning

| Competitor | ShadowAPI difference |
|------------|----------------------|
| Browserbase / raw Playwright | **Connector outcomes** + session vault + schema-stable API |
| Skyvern (agent browses) | **Deterministic graphs** + audited versions; LLM only in repair |
| Generic scrapers | **Ops playbooks**, proxy quarantine per domain, MFA once |

**Day-1 win:** Ship **named connectors** with frozen manifests, async MCP, and staging fixtures—not “better stealth” alone.

---

## 17. Implementation roadmap

Step-by-step checklists live in [ROADMAP.md](./ROADMAP.md). The phases below are the same plan, compressed.

### Phase 0 — Foundation

- [ ] Monorepo: `apps/gateway` (Fastify), `apps/worker` (BullMQ consumer), `packages/core`, `packages/graph-runner`
- [ ] PostgreSQL job store + state machine; Redis queue, idempotency, rate limits
- [ ] Connector manifest registry + CI linter + meta-schema
- [ ] REST `/v1/jobs` on the gateway (MCP uses the same services later)

### Phase 1 — Runtime core

- [ ] Worker-only Camofox integration (launch, proxy, teardown) — API process stays browser-free
- [ ] Graph runner v1 in `packages/graph-runner` (steps, branches, timeouts)
- [ ] Session vault + Redis locks (`read_shared` / `exclusive`)
- [ ] S3 artifacts + signed URLs from the gateway

### Phase 2 — First connector

- [ ] `carrier_x_pod` graph `v1.0.1-g2`
- [ ] Seven staging fixtures + integration tests (graph runner without live browser where fixtures allow)
- [ ] Pre-flight validation (zip vs session_id)
- [ ] Redis cache with `ttl_by_status`; cached reads do not occupy a worker

### Phase 3 — MCP & Studio

- [ ] MCP on the Fastify gateway (or a thin sibling) over the same job service — not a second business logic stack
- [ ] Next.js portal: API keys, usage, connector docs
- [ ] Studio MVP (Next.js): record → graph compile → publish manifest
- [ ] Repair lane UI (diff review, staging promote)

### Phase 4 — Commercial

- [ ] Plan billing (cached vs live meters), API keys, Redis rate limits
- [ ] Horizontal gateway replicas; worker autoscaling on queue depth; per-tenant concurrency caps
- [ ] Second vertical connector (template reuse)
- [ ] Enterprise: dedicated capacity, BYO proxy

---

## 18. Glossary

| Term | Definition |
|------|------------|
| **Connector** | A published integration (`connector_id`) with manifest + graph |
| **`connector_version`** | Semver of API contract (input/output schema) |
| **`graph_version`** | Pin of execution steps (can change without schema bump) |
| **Camofox** | Stealth Firefox build used by the execution engine |
| **Vault session** | Encrypted `storageState` (cookies/localStorage) in Postgres, keyed by `session_id` and scoped to `tenant_id` + `connector_id` |
| **`session_generation`** | Monotonic counter for cache correctness after reauth |
| **Repair lane** | Offline LLM-assisted graph fix workflow |
| **Fixture** | Recorded HTML/HAR for staging replay without live target |
| **MCP** | Model Context Protocol — tool interface for AI hosts |

---

## Document history

| Date | Change |
|------|--------|
| 2026-09-25 | Initial master doc from product briefing + architecture review + `carrier_x_pod` v1.0.1 RC |
| 2026-09-25 | Added [OVERVIEW.md](./OVERVIEW.md); §0 product summary; clarified platform vs catalog GTM |
| 2026-09-25 | Decided stack (Fastify, Postgres, Redis, worker split). Detailed build order in [ROADMAP.md](./ROADMAP.md) |

---

## Related artifacts (to add in repo)

- `schemas/v1/connector-manifest.json` — meta-schema
- `connectors/carrier_x_pod/v1.0.1/manifest.json` — frozen connector
- `connectors/carrier_x_pod/graphs/v1.0.1-g2.json` — execution graph
- `connectors/carrier_x_pod/fixtures/*` — staging replay
- `docs/MCP.md` — tool descriptions and agent polling guide
- `docs/RISK-REGISTER.md` — full likelihood × impact matrix
