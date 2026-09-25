# Camoufox — guide for ShadowAPI (humans & agents)

How we install, run, and integrate the **[Camoufox](https://github.com/daijro/camoufox)** anti-detect browser. Official docs: **[camoufox.com](https://camoufox.com)**.

ShadowAPI uses Camoufox **only in the worker** (and later Studio). The **gateway never** launches a browser. Integrators only see HTTP jobs and JSON.

Last updated: 2026-09-25

---

## 1. What Camoufox is

| Layer | What it is |
|-------|------------|
| **Engine** | Firefox fork with fingerprint hardening (canvas, WebGL, fonts, navigator, etc.) |
| **Automation** | Playwright-compatible API via **`camoufox-js`** (Node) or **`camoufox`** (Python) |
| **Binary** | Downloaded from [daijro/camoufox releases](https://github.com/daijro/camoufox/releases) (~660MB), not built from source for normal dev |

**Do not use** [jo-inc/camofox-browser](https://github.com/jo-inc/camofox-browser) as ShadowAPI’s backend — it is a separate agent HTTP server. We drive the **same engine** from **`apps/worker`**.

---

## 2. ShadowAPI usage model

```
POST /v1/jobs  →  gateway (no browser)
                    →  Redis queue
                         →  worker: Camoufox context + graph steps
                              →  JSON result + optional S3 PDF
```

Per job on the worker ([PROJECT.md §6.4.1](./PROJECT.md#641-multi-tenant-isolation-flow)):

1. Decrypt tenant **`storageState`** from Postgres (if `session_id` set).
2. **`browser.newContext({ storageState })`** — isolated cookies; no cross-tenant leakage.
3. Run the **versioned graph** (navigate, fill, click, branch P1/P2/P3 — [§6.3.1](./PROJECT.md#631-post-submit-navigation-patterns-tracking-and-similar-flows)).
4. **`context.storageState()`** → re-encrypt vault if cookies changed.
5. **`context.close()`** before the next tenant.

Production code path: **`camoufox-js`** inside `apps/worker` (TypeScript, same repo as gateway).

---

## 3. Install the browser binary

Use the **latest stable** package at install time (`-U` / no old pin).

### Option A — Node (production worker)

From `apps/worker` once the package exists:

```bash
pnpm add camoufox-js   # latest in lockfile
# Follow camoufox-js / package postinstall to fetch the browser binary
```

Check the package README for the exact fetch command (often automatic on install).

### Option B — Python (local debugging only)

Optional venv at repo root (gitignored as `.venv-camoufox`):

```bash
python3 -m venv .venv-camoufox
.venv-camoufox/bin/pip install -U 'camoufox[geoip]'
.venv-camoufox/bin/python -m camoufox fetch
```

Binary cache example: `~/.cache/camoufox/browsers/official/…`

---

## 4. Minimal headless run (Python)

Use this to verify the binary on a new machine:

```python
from camoufox.sync_api import Camoufox

with Camoufox(headless=True) as browser:
    page = browser.new_page()
    page.goto("https://example.com", wait_until="domcontentloaded", timeout=60000)
    print(page.title())
```

```bash
.venv-camoufox/bin/python -c "..."   # or save as a one-off script locally
```

### Async (Python)

```python
import asyncio
from camoufox.async_api import AsyncCamoufox

async def main():
    async with AsyncCamoufox(headless=True) as browser:
        page = await browser.new_page()
        await page.goto("https://example.com")
        print(await page.title())

asyncio.run(main())
```

### Node (worker-style sketch)

Follow **`camoufox-js`** exports in the worker package; pattern matches Playwright:

- launch browser → `newContext` → `newPage` → `goto` / `fill` / `click` → `close`.

---

## 5. Contexts, sessions, and isolation

| Concept | Practice |
|---------|----------|
| **Warm browser** | Reuse one Camoufox process per worker machine |
| **Per job** | New **context** (incognito); do not reuse one context across tenants |
| **Vault** | Playwright **`storageState`** JSON encrypted in Postgres; clients pass **`session_id`**, never cookies |
| **Proxy** | Set per manifest (sticky session when cookies bind to egress IP) |
| **Headless** | `headless=True` in production; `headless=False` or GUI only on dev desktops |

Cookie import for debugging (Python CLI):

```bash
.venv-camoufox/bin/python -m camoufox path   # see `camoufox --help`
```

---

## 6. Tracking flows (P1 / P2 / P3)

After the user submits a parcel number, sites behave differently. Graphs must declare waits/branches:

| ID | Behavior | Detection |
|----|----------|-----------|
| **P1** | Same URL; JS updates DOM | Wait for selector or network; URL unchanged |
| **P2** | Query string changes | `wait_for_url` / URL pattern with `?…` |
| **P3** | New path | `wait_for_url` / path change (e.g. `/tracking` → `/tracking/123`) |

**Production:** record these in **Studio** → compile to graph JSON → replay in **fixtures** (Chapter 5–6 in [ROADMAP.md](./ROADMAP.md)).  
**Do not** rely on generic “guess the input field” automation for catalog connectors.

---

## 7. GeoIP and proxies

- Install **`camoufox[geoip]`** when using proxies so locale/timezone align with egress ([camoufox.com/python](https://camoufox.com/python)).
- ShadowAPI proxy profiles live in the **connector manifest** (datacenter vs residential, sticky hours).

---

## 8. GUI (optional)

```bash
.venv-camoufox/bin/pip install -U 'camoufox[gui]'
.venv-camoufox/bin/camoufox gui
```

Needs a display. Servers use headless only.

---

## 9. Troubleshooting

| Symptom | Action |
|---------|--------|
| Browser not found | Re-run `python -m camoufox fetch` or reinstall `camoufox-js` |
| Linux shared library errors | Install Playwright/Firefox deps per [camoufox.com](https://camoufox.com) |
| `CHALLENGE_REQUIRED` in jobs | Target bot wall — ops reauth or proxy playbook; not a Camoufox install bug |
| Stale session | Bump `session_generation`, refresh vault in Studio |

---

## 10. What agents should do in this repo

1. Read [PROJECT.md §6.2–6.5](./PROJECT.md) for architecture.
2. Change browser code **only** under `apps/worker` (and later Studio).
3. Prefer **`camoufox-js`** + shared `packages/graph-runner` for production.
4. Use Python one-liners above only for **local** engine checks.
5. Never add Camoufox to `apps/gateway`.

---

## Related

| Doc | Topic |
|-----|--------|
| [ROADMAP.md](./ROADMAP.md) | Ch. 7 worker integration |
| [PROJECT.md](./PROJECT.md) | Vault, graphs, manifests |
| [README.md](../README.md) | Platform dev commands |
