# XAU agent loop (AGENT_LOOP_TICK_xau)

**This file is authoritative for agent behavior.** If anything in [XAU-SCALP-STUDY.md](./XAU-SCALP-STUDY.md) conflicts with this protocol, **follow this file**.

**Runbook:** [XAU-AGENT-LOOP.md](./XAU-AGENT-LOOP.md)

---

## Mandatory agent decision protocol

Follow on **every** tick. **Hard filters first** — alignment score **never** overrides a failed filter.

### 0. Definitions

Use objective rules in study **§3.4** only. Do not paraphrase or invent structure.

### 1. Data integrity

- Decisions from **last line of `bars-5m.jsonl`** (closed M5) and **last line of `bars-15m.jsonl`** (closed M15) — **never** `latest.json` for entry confirmation.
- On **`isNew5mBar`**, read **`context.json` → `signal`** (staleness, slippage, `alreadyProcessed`, `signalId`, `limits`).
- Missing / contradictory / unverified fields → **`WAIT_DATA`** (do not ENTER).
- **Support / resistance:** use **`context.levels`** as the authoritative calculated S/R context (nearest levels, zones, `consider`, `closedBar`). Do **not** invent levels or derive alternative S/R ad hoc.
- **Indicators and structure:** use parsed fields on **`latest.json` / archived bars** and study **§3.4** for ADX, RSI, VWAP, EMA, triggers, FVG, sweeps. Use **`context.levels`** only for its documented S/R and level-reaction fields — not as a substitute for M5 ADX/RSI/etc.
- **`context.dataIntegrity.ok === false`** → **`WAIT_DATA`** (do not ENTER). Do not use the old “M15 close vs M5 close” rule as primary feed sanity — use **`dataIntegrity`** (same-poll quote vs OHLC and cross-TF mids).
- **`tradePlan`:** **`primary.meetsMinRR`**, **`primary.ok`**, **`tradePlan.plansComputed`**, and **`primaryDirection`** are **math / candidates only** — **never** sufficient for **ENTER** or **`actionableWatch`**. **ENTER** requires **`isNew5mBar`**, fresh **`signal`**, all hard filters, and score. Paste **`chatDraft`** only when **`tradePlan.actionableWatch === true`**. On **ENTER**, paste **`tradePlan.chatEnterTemplate`** (still not an order).
- **`signal.alreadyProcessed === true`** → no second **ENTER** for that `signalId`; decision **`WAIT`** (silent unless user asked).

### 1.1 Signal freshness (60s loop — mandatory)

When `isNew5mBar` and `context.signal` is present:

| Field | If true → fail hard filter #4 |
|-------|-------------------------------|
| `signal.staleByAge` | Poll too late after closed bar (default max **120s** since bar archived) |
| `signal.staleBySlip` | Mid price moved too far from signal close (default **$2.50**) |

If stale: decision **`WAIT`** or **`FLAT`**, log evaluation, **discard** this opportunity (wait for a **new** M5 setup). Do not “chase” at a worse price.

Example: M5 closes **10:05:00**; poll at **10:06:30** with slip **$3** → **no ENTER** even if bias looks good.

### 2. Hard filters (all must pass before score or ENTER)

Any failure → **`FLAT`**, **`WAIT`**, or **`WAIT_DATA`** — **never ENTER**:

1. Complete setup type: **`trend_pullback`** OR **`sweep_fvg`** (not mixed). Default automation: **`trend_pullback` only**; sweep → **`WAIT_DATA`** unless every sweep/FVG/CHoCH/retest step is verified from `bars-5m.jsonl`.
2. **M15 bias** matches direction (study §3.4).
3. **`isNew5mBar`**, trigger = archived closed M5; **`alreadyProcessed`** is false.
4. **`staleByAge`** and **`staleBySlip`** are **false**.
5. Spread ≤ **`limits.spreadMaxPoints`** (default 80).
6. **`context.dataIntegrity.ok === true`** (quote vs OHLC on each TF; M5/M15 **mid** gap ≤ **`XAU_M15_M5_MID_MAX_USD`**, default **$8**). On **`isNew5mBar`**, **`dataIntegrity.m5ArchiveOk`** must be true or the closed bar was not archived → **`WAIT_DATA`**.
7. **Structural stop** from closed bars; distance ≤ **`limits.maxStopAtrMult × M5 ATR`** when ATR parsed; **never** tighten stop to pass.
8. **Planned TP1** achieves **net R:R ≥ `limits.minNetRR`** (default **1.5**) vs net risk (spread + slip included). **Do not** use a 1R TP1 that violates this — see study §4.3.
9. **News (`context.news`):** if **`news.inBlackout === true`** → **FLAT**. If **`news.ok !== true`**, calendar stale/missing required fields, or fetch failed → **`WAIT_DATA`** (do not ENTER; never claim “no news”). Successful fetch does not remove upcoming events — apply blackout minutes to **`news.upcoming`**. User-declared red window → **FLAT**.
10. Required parsed fields for the setup are present (not UNKNOWN).

**Score only after all pass.**

### 3. Setup-specific confirmation

**Trend pullback:** M15 bias; M5 EMA stack; M5 ADX ≥ 20 if parsed else no ENTER; pullback + **closed** M5 trigger (study §3.4); structural invalidation.

**Sweep + FVG:** All steps verified from bars or **`WAIT_DATA`**.

### 4. Scoring (secondary)

Study §3.3; minimum **`limits.minAlignmentScore`** (default 4). Cannot compensate for any failed hard filter.

**Levels (when `context.levels.ok`):**

- **+1** long alignment if **`consider.longAtSupport`** or **`closedBar.bounceAtSupport`** on the signal bar.
- **+1** short alignment if **`consider.shortAtResistance`** or **`closedBar.rejectionAtResistance`** on the signal bar (still requires M15 bias / setup rules for direction).
- Planned **TP1** should prefer the next **`nearestResistance`** (longs) or **`nearestSupport`** (shorts) that meets **net R:R ≥ minNetRR** — do not invent levels.

Proximity alone (**`inSupportZone` / `inResistanceZone`**) is **never** sufficient for **ENTER**.

### 5. Entry, risk, and execution language

- **Entry price** = executable **bid/ask/mid** (`signal.executableMid`), not only signal candle close.
- Chat **ENTER** = **proposed trade passed filters** — **not** an MT5 fill, not an order placed. Say explicitly: *“Recommendation only — you execute on MT5.”*

**Mandatory user-facing trade block** (copy from **`context.tradePlan`** when numbers exist; do not invent prices):

Use this **exact field order** when **`tradePlan.actionableWatch`** or on **ENTER**:

1. **Entry range:** `$low – $high` (limit / market only if price is inside the range)
2. **Target (TP1):** `$price`
3. **Stop loss:** `$price`
4. **Take profit (TP2):** `$price` (or “trail” if null)
5. **Net R:R to TP1:** `~X.X` when computed

- On **ENTER:** paste **`context.tradePlan.chatEnterTemplate`** after the decision line (recompute only if you logged different prices in evaluation).
- On **`tradePlan.actionableWatch === true`** only: paste **`context.tradePlan.chatDraft`** — label **draft**, not ENTER.
- When **`tradePlan.role === "candidate"`** and **`actionableWatch === false`**: do **not** paste a trade block in chat (levels may still be mentioned in one line).
- Log the same numbers in **`xau-log-evaluation.mjs`**: `entryLow`, `entryHigh`, `stop`, `tp1`, `tp2`, `netRRtp1`.

If **`tradePlan.primary`** missing or `stop`/`tp1` null → do not fabricate; say **WAIT_DATA** for plan.

### 6. Audit log (required on every `isNew5mBar`)

Always append one line (including rejections):

```bash
node /var/www/ShadowAPI/tools/xau-scalp-agent/server/xau-log-evaluation.mjs '{"signalId":"...","decision":"WAIT","setup":"trend_pullback","hardFilters":{"stale":false,"spread":true},"score":0,"reason":"..."}'
```

Path: **`~/.local/state/xau-scalp-agent/evaluations.jsonl`**

Required fields: `signalId`, `decision`, `setup`, `direction`, `hardFilters`, `score`, `entry`, `stop`, `tp1`, `tp2`, `netRRtp1`, `reason`.

On **`ENTER`** only, also note in chat and optional **`decisions.jsonl`**, and run:

```bash
node /var/www/ShadowAPI/tools/xau-scalp-agent/server/xau-log-signal.mjs '{"type":"enter","direction":"short|long","entryLow":...,"entryHigh":...,"stop":...,"tp1":...,"tp2":...,"note":"Agent ENTER recommendation"}'
```

### 7. User-visible messages

**Every tick (mandatory):** Run and paste the full output of:

```bash
node /var/www/ShadowAPI/tools/xau-scalp-agent/server/xau-agent-brief.mjs
```

Or copy the block between **`XAU_AGENT_BRIEF_START`** / **`XAU_AGENT_BRIEF_END`** from the loop terminal. It gives **Action / Why / When / Price** in plain language — **do not** replace it with “Tick #N” or monitoring jargon.

Then, if not already covered by the brief:

- **`watchRevoked.notify === true`:** ensure stand-down is clear — **never** paste a new **`chatDraft`** on the **same** tick.
- **`isNew5mBar`:** append closed 5m note if useful; always **`xau-log-evaluation.mjs`** (including rejections).
- **`tradePlan.actionableWatch === true`:** brief includes **`chatDraft`** — user still clicks MT5.
- **ENTER:** brief + **`chatEnterTemplate`** + evaluation with prices.
- Bridge **`ok: false`** or **`WAIT_DATA`:** brief covers it; keep one line if needed.

**Do not go silent on routine polls** — the user brief **is** the routine message.

**Issued watches:** when you paste **`chatDraft`**, the poll loop stores it in **`active-watch.json`**. If price leaves the zone, the plan turns off, prices change, or a **new 5m bar** closes before the user enters, the next tick sets **`watchRevoked`** — you must say **do not enter** the old plan.

**Signal tracking:** each **new** draft watch and each **revoke** is auto-appended to **`~/.local/state/xau-scalp-agent/signals.jsonl`** and **`signal-journal.md`** (see **`SIGNAL-RECOMMENDATIONS.md`**). Mention the journal path once when pasting a **new** draft so the user knows where to review history.

Include **`levels`** in **`xau-log-evaluation.mjs`** JSON when present (`nearSupport`, `nearResistance`, `consider`).

---

## Read order

1. `context.json` (`signal`, `limits`, **`dataIntegrity`**, **`levels`**, **`tradePlan`**, **`watchRevoked`**, **`news`**)
2. `bars-5m.jsonl` / `bars-15m.jsonl` (closed)
3. `latest.json` (forming — watch only)
4. `/tmp/xau-agent-status.json`
5. Recent `ticks.jsonl`; last `evaluations.jsonl` if needed

## Tunables (`context.limits`)

| Env | Default |
|-----|---------|
| `XAU_SPREAD_MAX_POINTS` | 80 |
| `XAU_SIGNAL_MAX_AGE_SEC` | **120** |
| `XAU_MAX_SLIPPAGE_USD` | 2.5 |
| `XAU_MAX_STOP_ATR_MULT` | 1.2 |
| `XAU_MIN_NET_RR` | 1.5 |
| `XAU_MIN_ALIGNMENT_SCORE` | 4 |
| `XAU_M15_M5_CLOSE_MAX_DELTA_USD` | 3 (legacy; prefer **`dataIntegrity`**) |
| `XAU_QUOTE_OHLC_MAX_USD` | 3 |
| `XAU_M15_M5_MID_MAX_USD` | 8 |
| `XAU_BAR_ROLL_CLOSE_OPEN_MAX_USD` | 2.5 |
| `XAU_BAR15_ROLL_CLOSE_OPEN_MAX_USD` | 4 |
| `XAU_ADX_MIN` | 20 |
| `XAU_AGENT_LOOP_SEC` | 60 |
| `XAU_CALENDAR_EVERY_N_TICKS` | 10 |
| `XAU_CALENDAR_API_URL` | `…/wp-json/fc/v1/calendar-view` |
| `XAU_NEWS_BLACKOUT_MIN` | 30 |
| `XAU_NEWS_LOOKAHEAD_HOURS` | 72 |
| `XAU_NEWS_MAX_STALE_MIN` | 90 (calendar older → `news.ok: false` / `WAIT_DATA`) |
| `XAU_LEVELS_ZONE_ATR_MULT` | 0.4 (near S/R band = mult × M5 ATR) |
| `XAU_LEVELS_ZONE_USD_FALLBACK` | 1.2 (if M5 ATR missing) |
| `XAU_LEVELS_M5_RANGE_BARS` | 12 |
| `XAU_WATCH_COOLDOWN_SEC` | 180 (no new watch alerts after stand-down) |

Optional manual levels: **`~/.local/state/xau-scalp-agent/levels.json`**

```json
{ "supports": [4040], "resistances": [4055] }
```

Stop loop: Ctrl+C or kill `xau-watch-loop.mjs`.

### News calendar (manual test)

```bash
node tools/xau-scalp-agent/server/xau-fetch-calendar.mjs
cat ~/.local/state/xau-scalp-agent/news-calendar.json
```
