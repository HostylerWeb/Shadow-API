# Teach site browser and browse proxy

Authoring rules (generic keys, extract primitives): [TEACH-AUTHORING.md](./TEACH-AUTHORING.md).

ShadowAPI’s teach flow loads customer sites inside an iframe on the portal (for example `http://localhost:3001/endpoints/new/record`). The iframe does not navigate to the third-party origin directly. It uses a **same-origin browse proxy** so the portal can inject teach tooling, rewrite asset URLs, and keep cookies/session on the portal.

This document summarizes problems we hit when proxying **single-page apps (SPAs)** such as [7daysperformance.co.uk](https://7daysperformance.co.uk/), and how they were fixed. The intent is **generic** behavior for path-based routers and typical asset layouts—not one-off hacks for a single hostname.

## How browse works (two URL shapes)

| Shape | Example | Purpose |
|--------|---------|---------|
| **Document mirror** | `http://localhost:3001/?u=https%3A%2F%2F7daysperformance.co.uk%2F` | Iframe **document** URL: browser `pathname` matches the site (`/` for homepage) so Angular/React routers resolve the right route. |
| **Asset mirror** | `http://localhost:3001/build/assets/main.xxx.js?u=https%3A%2F%2Fsite%2F` | Scripts, styles, fonts: same **pathname** as the real site, with site root in `u`. Middleware rewrites to `/api/browse?u=<full upstream URL>`. |
| **Asset proxy (direct)** | `http://localhost:3001/api/browse?u=https%3A%2F%2F…%2Fmain.xxx.js` | Still valid for fetch/XHR and some subresources; HTML rewrite usually emits **mirror** URLs (see §7, §11). |

Middleware rewrites mirror requests internally to `/api/browse?u=<resolved-upstream-url>`. The browse route (`apps/portal/app/api/browse/route.ts`) fetches upstream, rewrites HTML/CSS when needed, and injects the proxy client + teach scripts.

Key modules:

- `apps/portal/src/browse/rewrite.ts` — HTML/CSS URL rewriting, **ESM import rewriting**, API JSON pass-through, SPA static fallbacks
- `apps/portal/src/browse/proxy-client-script.ts` — In-frame history, fetch/XHR, link/form proxying
- `apps/portal/src/browse/browse-mirror.ts` — Mirror URL helpers and upstream resolution from path + `u`
- `apps/portal/middleware.ts` — Rewrite mirror paths to `/api/browse`
- `apps/portal/app/endpoints/new/record/site-browser.tsx` — Iframe `src` via `mirrorBrowseHref()`

## Issues and fixes

### 1. Angular “404” inside a loaded shell

**Symptom:** Nav and branding appeared, then a large **404** (“Sorry, but the page you were trying to view does not exist”) while some content below still leaked through.

**Cause:** The iframe used `src=/api/browse?u=…`, so `window.location.pathname` was `/api/browse`. Path-based SPAs (Angular default) match routes against that pathname; there is no `/api/browse` route on the customer site.

**Attempted fix:** Patch `Location.prototype` getters in the injected proxy script so `pathname`/`search`/`hash` reflect the nested site URL from the `u` query param.

**Why that failed:** In Chromium, `location.pathname` is backed by **instance-level** getters with `configurable: false`. Defining getters on `Location.prototype` does not override what the router reads; `pathname` stayed `/api/browse`.

**Fix:** Serve the **document** at a mirrored path with the site root in `u`:

- Iframe: `mirrorBrowseHref("https://7daysperformance.co.uk/")` → `/?u=https%3A%2F%2F7daysperformance.co.uk%2F`
- Browser pathname is `/`, which matches the site homepage route.

In-app link navigation still uses mirror paths (`/product/foo?u=…`) via the proxy client; middleware resolves path + `u` to the full upstream URL.

---

### 2. Blank SPA / wrong script URLs and MIME errors

**Symptom:** Empty `app-root`, module scripts failing, or HTML returned where JavaScript was expected.

**Causes:**

- Relative script URLs resolved against the portal or a wrong route (e.g. `/product/main.js` instead of `/main.js` when `<base href="/">`).
- Upstream returning **index.html** for missing static paths (SPA fallback); browse must retry root/static paths (`spaStaticAssetFallbackUrls` in `rewrite.ts`).
- HTML rewrite injecting browse scripts into **JSON API** bodies served as `text/html` (see below).

**Fixes:**

- Resolve relative URLs from **document base** (`readDocumentBase`, rewrite script/style tags against base, not the browse route).
- SPA static fallbacks when a `.js`/`.css` request returns HTML.
- Keep `<base href>` pointing at the **real site origin** after rewrite (`rewriteBaseHref` uses `readDocumentBase`, not proxied localhost URLs).

---

### 3. API calls returning HTML or HTTP 404 with JSON body

**Symptom:** Console errors for endpoints like `/api/v2/homepage-banner/active`; Angular stalled.

**Cause:** Some APIs respond with `Content-Type: text/html` but a JSON body, or HTTP 404 with parseable JSON. Rewriting those as HTML broke clients; Node `fetch` often sees 404 even when the body is valid JSON.

**Fix:**

- `shouldPassThroughBrowseBody` — do not run HTML rewrite on API-like paths or JSON-looking bodies.
- `normalizeTeachApiBrowseResponse` — for API-like paths, if body parses as JSON, respond with **200** and `application/json` so the SPA can continue in teach preview.

---

### 4. Fonts and images (OTS / decode errors)

**Symptom:** `Failed to decode downloaded font`, broken icons.

**Cause:** Root-relative `url(/assets/fonts/…)` in inline `<style>` or CSS was resolved against **localhost:3001**, not the site origin.

**Fix:** Rewrite CSS `url()` using a base of **site origin + `/`** (`rewriteCss`, `rewriteStyleTags`), and proxy through `/api/browse?u=…`.

Direct CDN hosts that should not be proxied (Google fonts, Apple Pay SDK, Trustpilot widget) are left absolute in `rewriteUrl`.

---

### 5. Tracker and consent scripts on localhost

**Symptom:** `__inlineTrackers.push is not a function`, CookieYes throws on wrong registrable domain.

**Fix:**

- `stripTeachTrackerScripts` removes common tracker/GTM/CookieYes tags from HTML.
- When stripping `__loadInlineTrackers`, inject a small stub so `__inlineTrackers.push` still exists.
- Proxy client swallows CookieYes-related `window.error` events in capture phase.

---

### 6. Mirrored assets served as HTML (wrong upstream target)

**Symptom:** After switching scripts to mirror URLs (`/main.xxx.js?u=site-root`), bundles returned **rewritten HTML** instead of JavaScript; Angular never booted.

**Cause:** On a rewritten request, Next still exposes the **original** `nextUrl` pathname to the browse handler (`/main.xxx.js`) while `searchParams.get("u")` remained the **site root** only. `publicTarget(u)` therefore fetched the **homepage**, and the HTML branch ran for a `.js` request.

**Fix:** Resolve the upstream URL from **pathname + `u`** before falling back to `publicTarget`:

```text
resolveMirroredUpstream(request) ?? publicTarget(u, portal)
```

Implemented in `browse-mirror.ts` and wired in `app/api/browse/route.ts`.

---

### 7. Next.js conflict with `/runtime.*.js` at the site root

**Symptom:** `GET /runtime.a0cc7f4dcfc2e12c.js?u=…` returned **404** from the Next app; `polyfills.*.js` and `main.*.js` on the same page succeeded.

**Cause:** Next.js reserves or handles **`runtime.[hash].js`** at the app root for its own client runtime. Mirroring Angular’s `runtime.*.js` to `localhost:3001/runtime.*.js?u=…` collided with the framework, even though other hashed bundles did not.

**Fix:** Use **two policies**:

- **Document + in-frame navigation:** mirror paths (`/?u=…`, `/path?u=…`) for correct router pathname.
- **Subresources in HTML rewrite and fetch/XHR:** prefer **mirror** URLs via `mirrorBrowseHref` in `rewrite.ts` (middleware resolves to `/api/browse`). The in-frame client still uses `browseAbsolute()` for dynamic fetch/XHR. Do **not** mirror root-level Next-reserved names such as `runtime.*.js` on the portal origin (see symptom above).

**Vite / ES module SPAs** also need §11; mirror URLs alone are not enough for `from "./chunk.js"` inside bundles.

---

### 8. New endpoint record redirects to `/endpoints/new?error=url`

**Symptom:** After filling title, description, and URL on **New endpoint**, clicking through to the record screen bounced back to `/endpoints/new?error=url` even when the URL was valid.

**Cause:** The record page tried to set the `teach_allow_hosts` cookie with `cookies().set()` inside a **Server Component**. In the App Router that throws; the error was caught and treated like a bad URL.

**Fix:** Set `teach_allow_hosts` in **`middleware.ts`** when `GET /endpoints/new/record` has valid `title`, `description`, and `url` query params. The record page only validates the URL and shows an error banner when params are missing or invalid (`apps/portal/app/endpoints/new/page.tsx`).

---

### 9. Vite widget stuck on skeleton (e.g. generate-random.org usernames)

**Symptom:** Teach preview showed the page chrome (title “Random Username Generator”, green terminal frame) but only **skeleton placeholders** inside `#username-generator-widget`—no style selector, count, or **Execute generation** button. Static FAQ and nav still rendered.

**Cause:** The site boots a **Vue 3 + Vite** app from `type="module"` chunks under `/build/assets/`. Mirrored script URLs look like:

`http://localhost:3001/build/assets/InputGroup-….js?u=https%3A%2F%2Fgenerate-random.org%2F`

Relative imports in those files (`from"./vue-vendor-….js"`) are resolved by the browser against the module URL. **Query parameters are dropped** for sibling paths, so the next request becomes:

`http://localhost:3001/build/assets/vue-vendor-….js` **without** `?u=…`

Middleware cannot resolve the upstream site → **401** → the module graph fails and Vue never mounts (skeleton HTML stays in the DOM).

**Fix:**

1. **`rewriteEsmImports`** in `rewrite.ts` — when the browse route serves JavaScript, rewrite relative `from "./…"`, `import"./…"`, and `import("./…")` specifiers to **absolute mirror URLs** that include `?u=<site root>`.
2. **`rewriteUrl`** — emit mirror paths (`mirrorBrowseHref`) for rewritten HTML/CSS/asset attributes instead of only `/api/browse?u=…`, so script `src` and preloads align with the same resolution rules.

**Verification:** Log in to the portal, open  
`http://localhost:3001/usernames?u=https%3A%2F%2Fgenerate-random.org%2F`  
(or the same URL inside teach record for `https://generate-random.org/usernames`). Confirm combobox, checkboxes, and `[ EXECUTE GENERATION ]` appear—not only `widget-skeleton`.

---

### 10. Issues outside the portal (not fixed in code)

| Issue | Notes |
|--------|--------|
| **502 / TLS reset** on some adult or bot-protected sites | Upstream closes connection from the server IP; browse shows `browseErrorHtml` with 502. |
| **CookieYes / third-party consent** on `localhost` | Mitigated by stripping/swallowing; full consent UX will not match production. |
| **Deep linking every route** | Mirror + middleware must stay ahead of portal routes; protected paths are listed in `isProtectedPortalPath`. |

---

### 11. Teach browse host allowlist (SSRF guard)

`/api/browse` only fetches hosts that are:

- Set on the **record** screen (`teach_allow_hosts` cookie for the declared entry URL), or
- Already used in a **published endpoint** manifest for the tenant (`start_url` / `result_url`), or
- Listed in **`TEACH_BROWSE_ALLOWLIST`** (comma-separated env on the portal).

Blocked requests log `[browse] blocked host=…` and return HTTP 403 HTML. A host the author already opened also allows its subdomains (`goldprice.org` allows `data-asg.goldprice.org`), because price and API calls often live on a sibling host. Prefer **embedded Camoufox** (`apps/studio-browser`) when the allowlist is too tight for exploratory teach.

### 12. Large response headers look like a dropped connection

**Symptom:** The preview says the HTTPS connection was reset, for a site that loads in a normal browser (seen with a large quote page whose CDN sends a very large header block).

**Cause:** Node’s built-in fetch rejects responses whose headers exceed 16KB (`UND_ERR_HEADERS_OVERFLOW`). The browse route reported every fetch failure as a refused connection.

**Fix:** Upstream fetches use Node’s HTTP client with a 256KB header limit, then decompress the body the same way fetch would.

---

## Verification

- **Unit tests:** `apps/portal/test/browse-rewrite.test.ts` (rewrite, API normalize, SPA fallbacks, base href, trackers, **ESM import rewrite**).
- **Manual / browser (Angular):** Log in as a portal customer, open teach record with `url=https://7daysperformance.co.uk/`, confirm iframe pathname `/`, no Angular 404, homepage competitions and hero content visible.
- **Manual / browser (Vite):** Same with `url=https://generate-random.org/usernames` — username generator widget hydrates (not skeleton-only).

Example record URL (local portal on 3001):

```text
http://localhost:3001/endpoints/new/record?title=…&description=…&url=https%3A%2F%2F7daysperformance.co.uk%2F
```

## Design takeaway

SPAs in an iframe need **two coordinated behaviors**:

1. **Router location** — document URL pathname (and in-app navigations) must match what the customer site expects, on a same-origin URL the portal controls (mirror + `u` site root).
2. **Assets and APIs** — mirror paths + `u` site root (rewritten to `/api/browse` server-side), with **ESM import rewriting** for Vite-style chunks, pass-through rules for JSON, and static fallbacks for SPA index.html—without fighting the host framework’s reserved paths (notably Next’s `runtime.*.js`).

Patching `window.location` in the browser is not a reliable substitute for getting the iframe URL shape right.
