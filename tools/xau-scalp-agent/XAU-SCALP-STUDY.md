# XAUUSD scalping study — M5 & M15 (TradingView)

**Purpose:** Shared playbook for this project and the **90s agent loop** (polls **15m + 5m** tabs only). Gold is spread-sensitive and news-driven. Nothing here guarantees wins; it defines **expert-style** workflow: fewer trades, **M15 bias**, **M5 closed-candle** entries, hard invalidation.

**Automation note:** The bridge reads your **5m and 15m** TradingView legends; **decisions** come from the agent applying this doc — not repainting scripts or blind alerts.

---

## Core idea (one paragraph)

Scalp **with M15 bias**, **enter on M5 bar close** when M15 and M5 align, using **closed candles only** and **structural invalidation** (rejected if stop distance exceeds **1.2× M5 ATR** when ATR is parsed). Two playbooks:

1. **Trend pullback** — M15 trend clear → M5 pullback to value (EMA cluster / VWAP) → **M5 continuation close**.  
2. **Liquidity + structure** — session high/low swept on **M5/M15** → **M5 FVG** or key level → **M5 CHoCH** → enter on **M5 retest** close.

If **M5** is chop (EMAs flat, ADX &lt; ~20), **no trade**.

---

## 1. TradingView indicators

Use **built-ins**. Automation expects **two tabs**: **XAUUSD 15m** and **XAUUSD 5m** (same broker feed as MT5).

### Chart A — execution (M5) ← agent polls this

| Indicator | Settings | Role |
|-----------|----------|------|
| **EMA** ×2 (or 20/50/100/200 bundle) | 20, 50 | Pullback zone and micro trend |
| **VWAP** | Session | Longs prefer price **above** VWAP when M15 bull; shorts **below** when M15 bear |
| **RSI** | 14, watch 40–60 zone | Pullback depth and trigger turn (not only 30/70) |
| **ATR** | 14 | Stop sizing and “candle too large” filter |
| **ADX** (+DI/−DI optional) | 14, **≥ 20–25** | Skip when ADX low and EMAs tangled |
| **Sessions** | Asia / London / NY | Session highs/lows for sweep narrative |

### Chart B — bias (M15) ← agent polls this

| Indicator | Settings | Role |
|-----------|----------|------|
| **EMA** 20 & 50 | — | **Bias:** longs if 20 ≥ 50 and price above both (or reclaiming); shorts mirror |
| **ADX** | 14 | Trend strength on HTF; weak ADX → smaller size or flat |
| **ATR** | 14 | Context for stop sanity vs M5 |
| Optional **RSI** 14 | — | Avoid fresh longs if M15 RSI &gt; 75 (unless breakout); shorts if M15 RSI &lt; 25 (unless breakdown) |

### Optional (after base stack is habit)

- Pivot Points (daily), M5 volume profile, **DXY** pane — see §3.3.  
- **M1 chart:** optional for you manually; **not used by the agent loop**.

### Layout checklist

- [ ] Symbol: **XAUUSD** (same as MT5).  
- [ ] Tab 1: **15m** — EMA 20/50, ADX, ATR.  
- [ ] Tab 2: **5m** — EMA 20/50 (or 20/50/100/200), VWAP, RSI, ATR, ADX if available.  
- [ ] Alerts: **on bar close** only.

---

## 2. Strategy — when to buy and sell

All entries assume the **M5 trigger candle has closed** (agent: use **`bars-5m.jsonl` last line** on `isNew5mBar`, not the forming bar in `latest.json`).

### 2.1 Global filters (no trade)

- **M5 ADX &lt; 20** (when parsed) and EMA 20/50 crossing repeatedly → chop.  
- **M5 range** on last closed bar &gt; **2× M5 ATR** in thin session → skip.  
- **Red news** ± **15–30 min** → no new scalps.  
- **M15 vs M5 conflict** (e.g. M15 bull stack but M5 making LLs) → flat until M5 **CHoCH** with M15.  
- **Spread:** if bridge spread &gt; your MT5 cap (e.g. **50** points on feed — tune per broker), **flat**.  
- **Data sanity:** M5 and M15 closes should be within a few dollars; wide mismatch → flat until charts fixed.

### 2.2 Long — trend pullback

**Context (M15):** price above EMA 20, EMA 20 ≥ EMA 50, ADX supportive.  
**Context (M5):** same EMA stack; ADX ≥ 20; pullback into **EMA 20–50 or VWAP** without **M5 close below EMA 50**.

**Trigger (M5 close):**

- Bullish engulfing or strong close in **top 25%** of range, or  
- Break + **close above** last M5 swing high (mini **CHoCH** / BOS).

**Invalidation:** below pullback low or **M5 close below EMA 50** (pick one).

### 2.3 Short — trend pullback

Mirror: M15/M5 bear stack, pullback from below into EMA 20–50 / VWAP, bearish M5 close, invalidation above pullback high or **M5 close above EMA 50**.

### 2.4 Long — liquidity sweep + M5 FVG

**Context:** sweep of session **low** (or equal lows) visible on **M5 or M15**; **M5 bullish displacement** leaving **FVG**.  
**Trigger (M5):** tap FVG → **M5 CHoCH** (close above last lower high) → enter on **retest close**, not first wick.  
**Invalidation:** below sweep low or M5 low of CHoCH structure.

### 2.5 Short — liquidity sweep + M5 FVG

Sweep of session **high** → M5 bearish FVG → M5 CHoCH down → retest close → invalidation above sweep high.

### 2.6 Decision summary

| Condition | Action |
|-----------|--------|
| M15 & M5 aligned, M5 ADX OK, **closed** M5 trigger | **Enter** |
| Sweep + M5 FVG + M5 CHoCH + retest close | **Enter** (with M15 if possible) |
| M5 chop, ADX low | **Flat** |
| Mid-bar / no new closed 5m bar | **Wait** |
| M15 vs M5 conflict | **Flat** or wait for M5 CHoCH |
| News / bad spread / bad data | **Flat** |

---

## 3. Reading price — M5 & M15

### 3.1 Candle patterns (M5 primary)

Prioritize **close location** and **range**: engulfing, pin/rejection at session levels, **displacement** (FVG), inside bar break **with M15 bias**, failed breakout after sweep.

**Rule:** **M15** sets **bias**; **M5** sets **setup + entry timing**.

### 3.2 Structure

HH/HL vs LH/LL on **M5** for timing; **M15** swings for bias. **CHoCH** on M5 for reversal scalps; **BOS** for continuation after pullback.

### 3.3 Confirmation ladder (automation uses steps 1–2 only)

1. **M15 — bias:** EMA 20 vs 50, price location, ADX.  
2. **M5 — setup + trigger:** EMA stack, ADX, VWAP side, **last closed bar** in `bars-5m.jsonl`.  
3. *(Optional manual)* **DXY** on M5 — long gold easier if DXY weak; skip if gold and DXY both rip on headlines.

**Alignment score (agent / manual):**

- +1 M15 bias matches trade direction (EMA stack + price)  
- +1 M15 ADX ≥ 20 (when present)  
- +1 M5 EMAs aligned with direction; ADX ≥ 20 (when present)  
- +1 M5 **closed** trigger quality (engulfing / CHoCH / strong close)  
- +1 VWAP side on M5 agrees  
- +1 spread within cap; M5/M15 prices consistent  

**Enter when score ≥ 4** after **all hard filters pass** (see [AGENT-LOOP-PROMPT.md](./AGENT-LOOP-PROMPT.md)). Score **never** overrides a failed filter. No “aggressive ≥3” in the automated loop.

### 3.4 Objective definitions (automation — v1)

| Term | Definition |
|------|------------|
| **M15 bull bias** | `ema20 ≥ ema50` **and** `close > ema20` **and** `close > ema50`. **Bear:** mirror. **Neutral/conflict:** price above EMA20 but EMA20 &lt; EMA50 → **no long** (shorts only if bear rules met). |
| **M15 ADX** | If parsed: must be **≥ 20** for trend setups; if **null** → condition **UNKNOWN** → no ENTER. Prefer **≥ 25** manually; automation uses **20**. |
| **M5 ADX chop** | If parsed and **&lt; 20** → **FLAT**. If null → UNKNOWN → no ENTER on trend setup. |
| **Strong M5 close (long)** | `(close − low) / (high − low) ≥ 0.75` **or** bullish engulfing vs prior **closed** bar in `bars-5m.jsonl`. |
| **Swing high/low** | Pivot bar with **2** bars left and **2** right in `bars-5m.jsonl`; swing available only after **2** bars later. Agent: use last **8** closed M5 bars only. |
| **FVG (M5)** | Three consecutive **closed** bars: bullish FVG if `low[i] > high[i-2]`; bearish if `high[i] < low[i-2]`. Min gap **≥ 0.3 × M5 ATR** when ATR parsed. |
| **CHoCH (M5 long)** | Close **above** most recent **confirmed swing high** from pivot rule. |
| **Sweep** | Wick beyond prior **session** high/low (manual session marks) by **≥ 0.1 × ATR** and **close back** inside — **not automatable** without session levels → sweep setup **WAIT_DATA** in loop v1. |
| **Support / resistance (automation)** | Read **`context.levels`** each poll: last **15m H/L**, **M5 swings**, **M5 range**, optional **`levels.json`**. Proximity **`watch`** / scoring only — not ENTER alone. |
| **VWAP** | Use parsed M5 VWAP only; session = chart default (NY). If null → UNKNOWN. |
| **News** | **`news-calendar.json`** from [Finance Calendar](https://www.financecalendar.com/) JSON API (not the HTML `/api/forex-calendar/` page). Loop fetches every **`XAU_CALENDAR_EVERY_N_TICKS`** (default **10**). Agent reads **`context.news`**. |

### 3.5 Sessions

Asia: range, fewer trades. London open: sweeps. NY overlap: best liquidity **if spread stable**. Late NY: reduce frequency.

---

## 4. Entry, stop, target (MT5)

### 4.1 Entry

- After **M5 close** only; agent evaluates on the first poll where **`isNew5mBar`** is true, using the **archived** bar in `bars-5m.jsonl`.  
- One position per setup; **0.25–0.5%** risk per trade (your choice).

### 4.1.1 Signal freshness (90s poll loop)

The loop polls about every **90 seconds**. A valid M5 close is **not** valid forever.

| Check | Rule (also in `context.signal`) |
|-------|----------------------------------|
| **Signal age** | Time from **closed bar archive** (`bars-5m.jsonl` `ts`) to **poll** (`context.ts`) must be ≤ **`XAU_SIGNAL_MAX_AGE_SEC`** (default **120** s). Example: bar logic at 10:05 → discard entry evaluation if processed after **10:07** unless age ≤ limit. |
| **Price drift** | \|executable mid − signal close\| must be ≤ **`XAU_MAX_SLIPPAGE_USD`** (default **$2.50**). |
| **One shot** | Each `signalId` is evaluated **once** (`evaluations.jsonl` + `processed-signals.json`). If stale → log **`WAIT`** / **`FLAT`**, **do not ENTER**, wait for a **new** setup on a later bar. |
| **Forming bar** | Never enter on `latest.json` mid-bar. |

If either age or drift fails, the opportunity is **discarded** — not “entered late.”

### 4.2 Stop (structural only)

1. Compute **structural invalidation** (pullback low/high or CHoCH level) from **closed** bars only.  
2. Measure stop distance from **executable entry** to that level.  
3. If M5 ATR is parsed and distance **>** **`maxStopAtrMult × ATR`** (default **1.2**) → **skip**.  
4. **Never** move structural stop closer to force the trade to qualify.

| Style | Placement |
|-------|-----------|
| Structure | Beyond M5 pullback low/high or CHoCH level |
| Sweep | Just beyond swept wick (only when sweep is verified — else no trade) |

There is **no separate ATR stop** — only structure, then the maximum-distance gate above.

### 4.3 Take profit and minimum R:R (consistent rule)

**Hard filter (automation):** Let **R** = (entry − stop) including estimated costs on the stop side. **Planned TP1** must satisfy:

**net reward to TP1 / net risk ≥ `XAU_MIN_NET_RR`** (default **1.5**),

where **net** subtracts spread and expected slippage (use `context.signal` and spread on the snapshot).

- **Do not** plan TP1 at “1R” if that would be below **1.5R net** — pick the **nearest structural level** (M5/M15 swing, session level) that still meets **≥ 1.5R net**, or **skip**.
- **Partials:** You may **take 50% off at TP1** once TP1 meets the minimum; optional **additional** partial near **1R net** only if TP1 was placed **farther** (e.g. TP1 at 1.5R net, scale partial at 1R net on the way). The **trade plan** must pass the TP1 ≥ min net R:R check **before** entry.
- **TP2:** typically **2R net** or next liquidity; **TP3:** trail M5 EMA 20 / structure.

**Time stop:** no +0.5R net within **2–3 M5 bars** → exit flat.

### 4.4 Hard exit

M5 **close through EMA 50** against position; news spike; daily **−2R / −3R** stop trading.

---

## 5. Agent + bridge (current)

| Step | Source |
|------|--------|
| Poll 5m + 15m tabs | `xau-watch-loop.mjs` → `latest.json`, `context.json`, `bars-*.jsonl` |
| Apply this doc | Agent on `AGENT_LOOP_TICK_xau` — [AGENT-LOOP-PROMPT.md](./AGENT-LOOP-PROMPT.md) |
| Audit trail | `evaluations.jsonl` via `xau-log-evaluation.mjs` |
| Signal dedupe | `processed-signals.json`, `pending-signal.json` in `context.signal` |
| Journal ENTER | `decisions.jsonl` |

---

## 6. Still to customize

1. Exact indicator names on TV (must match parser legend text).  
2. Primary playbook priority (pullback vs sweep+FVG).  
3. **Spread cap** in points for your broker.  
4. Session timezone for “news window” if automated later.

---

## Disclaimer

Research and workflow design only — not financial advice. Demo/backtest first; gold scalps depend on spread, slippage, and news.
