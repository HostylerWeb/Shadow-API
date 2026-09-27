# Chapter 16 — Launch checklist

No cloud IaC in this repo; use this list when leaving local dev.

## Infrastructure

- [ ] Production Postgres (managed), backups, restore drill documented
- [ ] Production Redis and S3/MinIO-compatible object store
- [ ] Gateway replicas behind TLS load balancer
- [ ] Worker fleet scaled on queue depth; **studio-browser** restricted to author networks
- [ ] Secrets in a manager (`VAULT_DATA_KEY`, `PORTAL_SESSION_SECRET`, `STUDIO_BROWSER_SECRET`, API keys)

## Security

- [ ] `METRICS_TOKEN` set; `GET /v1/metrics` not public
- [ ] Rate limits and WAF at edge
- [ ] `TEACH_BROWSE_ALLOWLIST` or studio-only authoring in production
- [ ] Portal: SMTP for password reset; consider `email_verified` enforcement

## Product

- [ ] Public API docs (OpenAPI + quickstart); no browser/runtime in customer copy
- [ ] Status page for **ShadowAPI API** availability
- [ ] Design partners on one vertical with real jobs
- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm lint:manifests` green in CI

## Operations

- [ ] Runbooks per catalog connector (`docs/runbooks/`)
- [ ] On-call playbook for quarantine, `CHALLENGE_REQUIRED`, session renewal
