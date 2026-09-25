# ShadowAPI

**Turn web portals into APIs** — record a flow once, call it from your app, backend, or AI tools.

Many carrier, insurance, and B2B sites have no public developer API. ShadowAPI exposes **maintained endpoints** for those workflows and returns clean JSON (and optional document links) so your product integrates like any other API — without manual portal work or fragile custom scripts.

---

## Start here

| Audience | Document |
|----------|----------|
| **Anyone new** — what it is, how it works, who builds vs who buys connectors, integration into apps | [**docs/OVERVIEW.md**](./docs/OVERVIEW.md) |
| **Engineers & architects** — Fastify gateway, workers, Postgres/Redis, jobs, MCP, roadmap | [**docs/PROJECT.md**](./docs/PROJECT.md) |
| **Founders / investors** — market fit, risks, 7.5→9 execution checklist | [**docs/POTENTIAL.md**](./docs/POTENTIAL.md) |
| **Builders** — A-to-Z chapters and checklists | [**docs/ROADMAP.md**](./docs/ROADMAP.md) |
| **Builders** — what is actually done so far | [**docs/PROGRESS.md**](./docs/PROGRESS.md) |

Read **OVERVIEW** first, **ROADMAP** when you are ready to build, **PROJECT** for the spec.

---

## In 30 seconds

1. **Subscribe or define** — Use a **catalog endpoint** (e.g. Carrier X POD) or, for advanced cases, define a custom connector in Studio.  
2. **Call** — Your software hits the ShadowAPI endpoint with the documented inputs.  
3. **Use** — You get structured results in your dashboard, app, database, or agent workflow.

Most customers only need steps **2** and **3**.

---

## Development (Chapter 1)

Requirements: **Node 22+**, **pnpm** (latest), **Docker** for Postgres, Redis, and MinIO.

```bash
cp .env.example .env
pnpm install
pnpm dev:infra          # postgres :5433, redis :6380, minio :9000 (host ports)
pnpm db:migrate         # apply schema (Chapter 2)
pnpm db:seed            # dev tenant + API key (print once)
pnpm dev:gateway        # http://localhost:3000/health
pnpm dev:worker         # BullMQ consumer (queue: shadowapi-jobs)

# Chapter 3 (gateway only — no worker required). Failure shapes: docs/API-FAILURES.md
# export DEV_API_KEY from pnpm db:seed
# JOB=$(curl -s -H "Authorization: Bearer $DEV_API_KEY" -H "Content-Type: application/json" \
#   -d '{"connector_id":"carrier_x_pod","inputs":{"tracking_number":"ABC"}}' \
#   http://localhost:3000/v1/jobs)
# curl -s -H "Authorization: Bearer $DEV_API_KEY" http://localhost:3000/v1/jobs/<job_id>
# curl -s -X DELETE -H "Authorization: Bearer $DEV_API_KEY" http://localhost:3000/v1/jobs/<job_id>
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

Camoufox (browser engine): [docs/CAMOUFOX.md](./docs/CAMOUFOX.md) — worker integration in ROADMAP Chapter 7.

---

## Docs index

| Topic | Location |
|-------|----------|
| Plain-language product overview | [docs/OVERVIEW.md](./docs/OVERVIEW.md) |
| Idea assessment & path to strong upside | [docs/POTENTIAL.md](./docs/POTENTIAL.md) |
| Full technical spec (includes decided stack) | [docs/PROJECT.md](./docs/PROJECT.md) |
| A-to-Z build checklist | [docs/ROADMAP.md](./docs/ROADMAP.md) |
| Chapter completion snapshot | [docs/PROGRESS.md](./docs/PROGRESS.md) |
| API failure body examples | [docs/API-FAILURES.md](./docs/API-FAILURES.md) |
| Camoufox engine guide | [docs/CAMOUFOX.md](./docs/CAMOUFOX.md) |
| Connector manifest system | [PROJECT.md §9](./docs/PROJECT.md#9-connector-manifest-system) |
| Example connector (Carrier X POD) | [PROJECT.md §10](./docs/PROJECT.md#10-reference-connector-carrier-x-pod) |
| REST & MCP job API | [PROJECT.md §8](./docs/PROJECT.md#8-async-api--mcp-integration) |
