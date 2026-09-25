# ShadowAPI — Idea assessment & upside

Internal notes on market fit, risks, and what moves the opportunity from **good** to **compelling**. Complements [OVERVIEW.md](./OVERVIEW.md) (product) and [PROJECT.md](./PROJECT.md) (build).

Last updated: 2026-09-25

---

## Headline scores

| Lens | Score | Summary |
|------|-------|---------|
| **Idea (overall)** | **7.5 / 10** | Real B2B pain, differentiated if sold as **maintained endpoints**, not generic automation infra. |
| **Upside (if executed narrowly)** | **8 / 10** | Strong niche API / integration business; platform optionality if the connector library compounds. |

Customers integrate **endpoints** (API keys, jobs, JSON). Runtime machinery stays internal — that positioning is part of what raises the score.

---

## What scores high

| Dimension | Rating | Why |
|-----------|--------|-----|
| **Problem** | 8.5/10 | Portals without public APIs are common; buyers already pay for manual ops or brittle in-house scripts. |
| **Positioning** | 9/10 | “Maintained endpoint for outcome X” (e.g. Carrier X POD) is easier to sell, price, and support than “we run browsers.” |
| **Product design (spec)** | 8/10 | Async jobs, manifests, business `NOT_FOUND` as success, cached vs live metering, LLM only in repair — mature on paper. |
| **AI angle** | 7/10 | MCP as thin wrappers on **fixed** endpoints is credible; avoids hype-driven “agent browses everything.” |
| **Moat (after shipping)** | 7–8/10 | Per-connector reliability, ops playbooks, and versioning beat copy-paste Playwright; moat is **library + maintenance**, not stealth alone. |

---

## What caps the score today

| Dimension | Severity | Why |
|-----------|----------|-----|
| **Execution load** | High | Each connector is a small product: fixtures, sessions, site changes, support. |
| **COGS** | Risk | Live runs and proxies erode margin without cache discipline and metering from day one. |
| **Legal / vendor** | Variable | Some targets tolerate integrations; others fight third-party access — vertical choice matters. |
| **Competition (low end)** | Crowded | Raw browser hosts are commodities; win on **named outcomes and SLAs**, not infra. |
| **Stage** | Gap | Potential is unproven until at least one endpoint is green in CI **and** stable for paying users. |

---

## Scenarios (plain terms)

### Best case — focused vertical

**$2M–$10M+ ARR** integration company in a chosen wedge (e.g. logistics POD, eligibility, dealer inventory). SaaS vendors and brokers embed ShadowAPI endpoints in **their** product. Studio and agency use expand TAM later.

### Moderate case

Solid **agency + custom connector** business: slower scale, still profitable if unlimited live runs are not subsidized.

### Weak case (avoid)

PLG “build any integration,” heavy Studio before catalog proof, compete on anti-bot — support and margin pressure dominate.

---

## Investor-friendly one-liner

**Large enough niche API business; platform optionality if the connector library compounds.** Credible when Phase 2 ships: reference connector, fixture suite, and production jobs — not more architecture alone.

---

## From 7.5 → 9: what actually moves the needle

These are ordered by leverage. More spec without the items at the top **does not** raise the score.

### 1. Prove one catalog endpoint end-to-end

- Ship `carrier_x_pod` (or equivalent) per [PROJECT.md §10](./PROJECT.md#10-reference-connector-carrier-x-pod): manifest, graph, **seven staging fixtures green in CI**.
- Run real jobs in production (even low volume) with the same contract integrators will see.

**Signal:** ShadowAPI is an API vendor with a product, not a deck.

### 2. Design partners who pay (or commit) before breadth

- 2–5 teams in **one vertical** integrating `POST /v1/jobs` into a live workflow (dashboard, TMS, eligibility screen).
- Capture: time saved, failure modes they accept, willingness to pay for **cached vs live**.

**Signal:** Problem and pricing are validated, not assumed.

### 3. Public API docs at “vendor API” quality

- OpenAPI (or equivalent), quickstart, idempotency, polling guide, failure codes, example responses including `NOT_FOUND` as success.
- Zero customer-facing mention of runtime; only endpoints, fields, and SLAs.

**Signal:** Matches the GTM story in [OVERVIEW.md](./OVERVIEW.md#what-customers-and-integrators-see).

### 4. Unit economics enforced in the gateway (early)

- Meter **cached reads** vs **live** runs; caps and overages aligned with [PROJECT.md §15](./PROJECT.md#15-monetization--unit-economics).
- Dashboard or internal metrics: cost per successful job, cache hit rate, retry burn.

**Signal:** PLG does not destroy gross margin.

### 5. Ops playbook per connector, not heroics

- Session renewal, `blocked` / `CHALLENGE_REQUIRED` runbooks, quarantine rules, customer comms when `graph_version` bumps.
- Repair lane with human approve + staging replay before prod ([PROJECT.md §12](./PROJECT.md#12-repair-lane-llm-off-the-critical-path)).

**Signal:** Maintenance is a process, not founder firefighting.

### 6. Second connector reuses the template

- Same manifest patterns, fixture style, and support model — proves the **platform** without building Studio first.

**Signal:** Connector library can compound.

### 7. Defer broad Studio / “any URL” until 1–6 exist

- Hand-authored graphs and manifests are enough for v1 catalog.
- Studio becomes a scale lever for agencies, not a prerequisite for first revenue.

**Signal:** Focus; avoids two products at once.

---

## Checklist summary (7.5 → 9)

| Done? | Milestone |
|-------|-----------|
| ☐ | Reference connector + fixtures green in CI |
| ☐ | Production jobs with stable REST contract |
| ☐ | Paying or committed design partners in one vertical |
| ☐ | Customer-facing API docs (endpoint-only narrative) |
| ☐ | Cached vs live metering live in product |
| ☐ | Per-connector ops runbook |
| ☐ | Second connector shipped with template reuse |
| ☐ | Studio MVP only after catalog proof (or scoped to internal ops) |

When most of the top half of this table is true, the **idea score** and **fundraising / partnership story** justify treating potential as **~9/10** for that vertical — with honest bounds on legal targets and maintenance cost.

---

## Related docs

| Document | Use |
|----------|-----|
| [OVERVIEW.md](./OVERVIEW.md) | What integrators see (endpoints only) |
| [PROJECT.md](./PROJECT.md) | How to build it; roadmap §17 |
| [README.md](../README.md) | Repo entry |
