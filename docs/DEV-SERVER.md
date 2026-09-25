# Local dev server

Use this on the machine where Docker runs Postgres, Redis, and MinIO (host ports **5436**, **6382**, **9000**).

## Daily startup

```bash
cp .env.example .env   # once
pnpm install
pnpm dev:infra
pnpm db:migrate
pnpm db:seed           # prints DEV_API_KEY once; save it in the shell or .env
```

In separate terminals (each: `set -a && source .env && set +a`):

| Command | URL |
|---------|-----|
| `pnpm dev:gateway` | http://localhost:3000 |
| `pnpm dev:gateways` | 3000 + 3010, nginx http://localhost:3080 |
| `pnpm dev:worker` | BullMQ consumer |
| `pnpm --filter @shadowapi/portal dev` | http://localhost:3001 |

Live `carrier_x_pod` needs `STAGING_ORIGIN` (worker sets this when tests run; for manual jobs start worker after infra is up). Camoufox binary: see [CAMOUFOX.md](./CAMOUFOX.md).

## Before `pnpm test`

Stop the long-running **dev worker** if it is consuming the same Redis queue, or accept that live worker tests compete for Camoufox.

If tests fail with `TenantBusyError`, stale **`running`** rows are usually the cause:

```bash
set -a && source .env && set +a
pnpm dev:clean-jobs
pnpm test
```

## Quality gate

```bash
set -a && source .env && set +a
pnpm typecheck && pnpm test && pnpm lint
```

Portal tests are included in root `pnpm test`.

## Roadmap

Chapters **1–15** are implemented locally. **Chapter 16** (production launch) is intentionally out of scope until you leave this dev setup.
