# Billing (local plans today)

## Implemented

- Plans: `developer` (10 live runs/mo), `agency` (100), `enterprise` (1000) — see `packages/core/src/plans.ts`.
- Gateway enforces live caps before enqueue (`RATE_LIMITED`).
- Cached reads metered separately from live runs (`usage_events.kind`).
- Plan changes: `POST /v1/billing/plan` (dev/admin) and portal usage page for admins.

## Product pricing (PROJECT §15 — not wired to payments)

| Tier | Indicative price | Positioning |
|------|------------------|---------------|
| Developer | ~$49/mo | Low live quota, cache-friendly |
| Pro Agency | ~$399/mo | Higher live quota, more connectors |
| Enterprise | $1.5k+/mo | Dedicated capacity, BYO proxy |

Stripe or another PSP is **out of scope** until Chapter 16 launch; this document maps future SKUs to current plan IDs.
