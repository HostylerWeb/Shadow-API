# ShadowAPI — Overview (read this first)

This document explains **what ShadowAPI is**, **who it is for**, and **how people use it**, without assuming you know APIs or integration jargon. For how the platform is built internally, see [PROJECT.md](./PROJECT.md).

---

## What is ShadowAPI? (one sentence)

**ShadowAPI turns websites that have no proper “developer API” into simple, reliable endpoints your software can call** — so your app, dashboard, or AI assistant can get data or documents from those sites **without a human clicking through the site every time**.

---

## What customers and integrators see

For most buyers, ShadowAPI is **not a browser product**. It is **an API**:

- A **documented endpoint** (or MCP tool) for a specific outcome — e.g. “Carrier X proof of delivery.”  
- An **API key**, request fields, and response fields (JSON, plus optional document links).  
- **Async jobs**: start a request, check status, fetch the result — like many modern backend services.

You integrate it the same way you would any vendor API: your server sends inputs, you receive structured outputs. **How** ShadowAPI reaches the underlying website is an internal operations concern; it is not something your product or your end users need to run, install, or understand.

---

## The problem it solves

Many businesses still depend on **vendor websites and portals** — shipping trackers, insurance logins, supplier catalogs, government forms. Humans can use them fine, but the vendor often **does not offer** a clean integration like “send us a tracking number, get JSON back.”

Teams usually try to:

- **Copy data manually** — slow and error-prone  
- **Build fragile one-off integrations** — break when the site changes and are expensive to maintain  
- **Wait for the vendor to build an API** — often never happens  

ShadowAPI sits in the middle: **ShadowAPI (or you) defines the integration once**, and your systems **call the endpoint whenever you need data**.

---

## How it works (simple picture)

Think of it in two phases: **define the endpoint** (usually ShadowAPI’s job) and **call the endpoint** (your job).

### Define the endpoint (once per integration)

ShadowAPI operators (or advanced customers using **Studio**) map a real-world workflow to a **connector**: a named, versioned API contract (example: `carrier_x_pod`) with documented **inputs** (tracking number, zip code) and **outputs** (status, delivery date, document link).

If the source system needs login or verification, that is handled **once during setup** and maintained by ShadowAPI — not by every API call from your app.

**Catalog customers** typically skip this phase: they subscribe to a ready-made endpoint and read the API docs.

### Dashboard and Studio (when you build your own connector)

This is for **account holders who author integrations** (your team, agencies, or advanced tenants). It is **not** what catalog-only buyers do day to day.

1. **Create an account** and sign in to the **dashboard**.  
2. Open **Studio** and use the **embedded Camofox browser** (preview) with **your tenant’s own session** — cookies and storage isolated from every other customer on the platform (see [PROJECT.md §6.4](./PROJECT.md#64-session--cookie-vault)).  
3. **Record a workflow**, not a single bookmark. Real parcel tracking (and similar flows) often use **multiple steps and URLs**, for example:  
   - Step A: `https://domain.com/tracking` — enter the parcel number and submit  
   - Step B: results on another URL such as `https://domain.com/result?tracking=123` or a path like `/result/123`  
4. Mark **inputs** (e.g. parcel number) and **outputs** (status, dates, document link) on the right screens.  
5. **Publish** — ShadowAPI exposes **one logical API endpoint** per connector (e.g. `POST /v1/jobs` with `connector_id`). Integrators never see the internal URLs or steps; they only send inputs and receive JSON.

#### After submit: three result patterns (must be supported)

When the user enters a tracking number (or any search input), portals behave differently. Studio and the graph runner must record and replay all of these:

| Pattern | What happens | Example |
|--------|----------------|---------|
| **1. Same page (SPA / in-place)** | URL may stay the same; results render via JavaScript on the current document | Still on `/tracking`, new DOM or network calls show status |
| **2. Query parameter** | Same path, URL gains or changes query string | `/tracking` → `/tracking?id=123` or `?tracking=123` |
| **3. Path navigation** | Browser navigates to a new path (or host) | `/tracking` → `/result/123` or `/result?tracking=123` |

The saved **execution graph** chains steps (navigate, fill, click, wait, branch) and declares how to detect success for each pattern (DOM signal, URL match, or network response). One connector can include **many internal URLs**; the public API stays a single job contract.

### Call the endpoint (every time your product needs data)

1. Your **app, server, or AI tool** calls ShadowAPI: connector ID + inputs.  
2. ShadowAPI runs the job and returns **structured data** (JSON) — status fields, dates, and optionally a **temporary link** to a PDF or image.  
3. You store or display that data in **your** product.

Your users never interact with ShadowAPI directly unless you choose to expose it. They only see **your** UI and your API.

```
  [ Your app / website / internal tool / AI assistant ]
                          │
                          │  POST /v1/jobs  (tracking ABC123)
                          ▼
                   [ ShadowAPI endpoint ]
                          │
                          ▼
                   JSON + optional document link
                          │
                          ▼
              [ Shown in your UI or used in your logic ]
```

---

## Two ways customers use the product

ShadowAPI supports **both** models. They can coexist.

| Model | Who | What they get |
|--------|-----|----------------|
| **Pre-built connectors** | Companies that want a solution now | You (ShadowAPI) sell ready-made APIs for specific sites or workflows — e.g. “Carrier X proof of delivery.” They subscribe and call your endpoint. |
| **Build your own connectors** | Developers, agencies, integrators | They use **Studio** to record flows for **their** portals (or their clients’), publish **their** endpoints, and integrate them into **their** apps or platforms. |

**Important:** The business may **emphasize selling polished, maintained connectors** (less “figure it out yourself,” more “it just works for Carrier X”). That is a **go-to-market choice**, not a limit on the platform. The same Studio and runtime powers both.

---

## Who is this for?

| Person | How they use ShadowAPI |
|--------|-------------------------|
| **Product owner / founder** | Turns a manual ops workflow into something the product can automate. |
| **Developer** | Calls HTTP APIs or MCP tools from backend code; embeds results in mobile apps, SaaS dashboards, cron jobs. |
| **Integration / ops team** | Maintains connectors when sites change; handles re-login when sessions expire. |
| **Agency** | Builds connectors for multiple clients under one account. |
| **AI / automation builder** | Lets Cursor, Claude, or internal agents call **approved** endpoints safely (start job → poll → result). |

**Example industries:** logistics, automotive wholesale, insurance eligibility, government procurement, any B2B portal without a public API.

---

## How developers integrate it into an app or web platform

Integration looks like any modern backend service:

1. **Get an API key** from ShadowAPI.  
2. **Choose a connector** (yours or one from the catalog).  
3. **Start a job** with inputs (tracking number, part ID, etc.).  
4. **Wait for completion** (often tens of seconds; ShadowAPI uses an **async** model: start → check status → get result).  
5. **Use the JSON** in your UI — show status, store in your database, attach the PDF link to an order record.

**Typical integration points:**

- **Web dashboard** — your server calls ShadowAPI; the user’s browser only talks to your API.  
- **Mobile app** — app → your backend → ShadowAPI.  
- **Background jobs** — nightly sync of shipment statuses.  
- **AI assistants** — agent calls ShadowAPI tools with fixed schemas instead of improvising web access.

Inputs and outputs are **defined per connector** (documented like a small contract), so your code knows what to send and what to expect.

---

## Examples in practice

These are typical patterns. In every case, **your customers use your product**; your **server** calls the ShadowAPI **endpoint** they need.

### E‑commerce or 3PL — proof of delivery on the order page

A shipping carrier has a tracking website but no API. Your order dashboard should show “Delivered,” delivery date, who signed, and a PDF proof-of-delivery.

Your backend runs a connector (for example `carrier_x_pod`) with the tracking number. After the job finishes, you save the status fields and a **short-lived download link** on the order. Support staff stay in **your** UI instead of logging into the carrier.

### Freight broker — morning status without copy‑paste

A broker used to open several carrier portals every day to check loads.

A **scheduled job** on your server starts one run per active shipment (catalog endpoint or a custom connector per carrier). Results flow into your TMS; exceptions can trigger Slack or email. If upstream access must be refreshed, the API returns a clear **blocked** status so ops can fix it — your integration code does not change.

### Insurance or benefits software — eligibility on a legacy payer site

Clinics expect “check coverage” inside your SaaS, but the payer only offers a web tool.

You call the eligibility endpoint with member ID, date of birth, and service date. Your API returns simple outcomes (active, inactive, not found) that your screens and billing rules understand.

### Automotive parts — gated dealer portal

Stock and price live behind login and two-factor authentication.

ShadowAPI completes **one-time setup** for the dealer login (maintained on the ShadowAPI side). Your ordering system sends part numbers whenever needed and gets structured stock and price back from the endpoint.

### Internal support with an AI assistant

Support asks: “Get proof of delivery for load 8842.”

An agent in Cursor or Claude uses **approved tools** only: start the job, wait, read the result — the same contract as your backend. If upstream access is blocked, the tool returns a clear status so a human fixes setup instead of the model guessing a status.

### Agency — many clients, many portals

An integrator records connectors for each client’s procurement site, government bid portal, or supplier catalog.

Each client gets their own API access to **their** connectors. The agency maintains recipes when sites change and wires results into **each client’s** dashboard—same platform as the catalog, but **built for that client**.

---

## What you get back (examples)

Depends on the connector. A shipping example might return:

- Tracking number  
- Status: delivered, in transit, exception, or not found  
- Delivery date and who signed  
- Optional link to download proof-of-delivery (PDF), valid for a short time  

“Not found” can still be a **successful** run (empty result), so your app does not treat it as a system crash.

---

## What ShadowAPI is **not**

Being clear avoids wrong expectations:

| Myth | Reality |
|------|---------|
| “It works on any URL with one click.” | Each flow must be **designed, recorded, and maintained**. Complex sites need testing and updates when the vendor changes their UI. |
| “It replaces the website’s permission.” | Customers are responsible for **legal and contractual** use of data (terms of service, contracts with carriers, HIPAA, etc.). ShadowAPI is infrastructure, not legal advice. |
| “AI browses the web live for every request.” | **Production runs follow fixed recipes.** AI helps **repair** broken recipes offline, not gamble on every click. |
| “Instant response every time.” | **Live** lookups can take **15–120+ seconds**. Repeated identical requests may be **cached** for speed and cost. |
| “No human ever again.” | Some source systems occasionally need **ops attention** (verification, expired access). Your API still returns a clear status; ShadowAPI handles renewal on the platform side. |

---

## Hard problems ShadowAPI is built to handle

These are handled **behind the endpoint** so your integration stays simple:

- **Access and security friction** on vendor sites  
- **Logins and verification** — setup and renewal without pushing that complexity into your app  
- **Vendor UI changes** — versioned connectors and maintenance, not broken scripts in your repo  
- **PDFs and downloads** — your app gets a **stable signed link**, not a fragile vendor URL  
- **Scale and fairness** — queues, rate limits, and caching across tenants  

Technical details: [PROJECT.md](./PROJECT.md).

---

## AI assistants (Cursor, Claude, etc.)

ShadowAPI can expose connectors as **MCP tools** so an AI agent in the IDE can say “run the Carrier X POD workflow.”  

Design rules:

- Tools **start** a job and **poll** for results — they do not hold a single request open for two minutes.  
- Schemas are **fixed** so the model does not invent invalid tracking numbers.  
- Dangerous or ambiguous cases (captcha, dead session) return **clear states** (“blocked — human must log in again”) instead of silent failure.

---

## Business model (high level)

- **Subscription tiers** (developer, agency, enterprise) with limits on connectors and monthly runs.  
- **Cheaper “cached” reads** vs **live** runs where appropriate.  
- **Enterprise:** custom connectors, dedicated infrastructure, bring-your-own proxy.  

Numbers and positioning: [PROJECT.md §15](./PROJECT.md#15-monetization--unit-economics).

---

## Document map (what to read next)

| If you are… | Read |
|-------------|------|
| New stakeholder, investor, or teammate | **This file** (OVERVIEW.md) |
| Market fit, risks, execution priorities (7.5→9) | [POTENTIAL.md](./POTENTIAL.md) |
| Implementing the platform | [ROADMAP.md](./ROADMAP.md) — build order and checklists; [PROJECT.md](./PROJECT.md) — spec |
| Implementing one connector | PROJECT.md §9 (manifests) and §10 (Carrier X POD example) |
| Repo entry | [README.md](../README.md) |

---

## Short glossary (plain English)

| Term | Meaning |
|------|---------|
| **Connector** | The named integration behind an endpoint (inputs → outputs). Catalog users think in terms of the **API name**, not the internal connector slug. |
| **Endpoint / API** | What integrators call — documented paths, fields, and responses. |
| **Job** | One request: specific inputs, one result payload. |
| **Session vault** | Encrypted portal login state per customer and connector; integrators pass a `session_id`, never raw cookies. |
| **Studio** | Internal/advanced tool to author connectors (optional; not required for catalog subscribers). |
| **MCP** | A standard way for AI tools to call external capabilities (like your connectors). |
| **Manifest** | The machine-readable description of a connector: inputs, outputs, rules, caching. |

Technical glossary: [PROJECT.md §18](./PROJECT.md#18-glossary).
