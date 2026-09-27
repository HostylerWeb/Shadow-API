# Risk register (summary)

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Target site layout change | High | High | Repair lane, fixtures in CI, per-connector runbooks |
| Proxy / egress burn | Medium | High | Cached reads, live caps, `CONNECTOR_QUARANTINE_THRESHOLD` |
| Vault key compromise | Low | Critical | `VAULT_DATA_KEY` in secrets manager at launch; KMS roadmap |
| Teach browse SSRF | Medium | High | Host allowlist + `TEACH_BROWSE_ALLOWLIST`; prefer studio-browser |
| Single-tenant noisy neighbor | Medium | Medium | Per-tenant and per-connector concurrency |
| Legal / ToS on targets | Variable | High | Vertical focus, customer contracts |

Owners: platform engineering + connector ops. Review quarterly or after major connector changes.
