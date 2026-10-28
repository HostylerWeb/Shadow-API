# XAU scalp — when to buy, when to sell (your guide)

This matches what the **60s poll loop** and agent use. Your **personal signal history** is appended automatically — see [Tracking your signals](#tracking-your-signals) below.

Strategy detail: [XAU-SCALP-STUDY.md](./XAU-SCALP-STUDY.md). Agent rules: [AGENT-LOOP-PROMPT.md](./AGENT-LOOP-PROMPT.md). Full ops runbook: **[XAU-AGENT-LOOP.md](./XAU-AGENT-LOOP.md)**.

---

## Start the tool and connect it to the agent (chat)

Two pieces must both be running — **polling alone does not talk to you in chat**.

| Piece | What it does |
|-------|----------------|
| **Poll loop** | Every **60s**: Chrome → TradingView → writes `context.json`, prints `AGENT_LOOP_TICK_xau` in the terminal |
| **Agent wake** | Cursor watches that terminal line and **runs the agent** so you get replies in chat |

### 1. One-time (each session)

1. Chrome **bridge** running (`tools/chrome-agent-bridge/server/bridge.js` on `127.0.0.1:17321`).
2. TradingView: **XAUUSD 5m** + **15m** tabs open (see [PARSE-AND-LOOP-CHECKLIST.md](./PARSE-AND-LOOP-CHECKLIST.md)).

### 2. Start the poll loop (background)

From **Cursor Agent**, run as a **background shell** (not a one-off that exits):

```bash
XAU_AGENT_LOOP_SEC=60 /var/www/ShadowAPI/tools/xau-scalp-agent/run-agent-loop.sh
```

You should see:

```text
[xau-loop] every 60s — persistent bridge — ticks → .../ticks.jsonl
AGENT_LOOP_TICK_xau {"prompt":"..."}
```

about once per minute.

### 3. Connect terminal → agent (so I report back) — **required**

In the same Cursor Agent session, enable **output monitoring** on the **background task** that runs the loop above:

```regex
^AGENT_LOOP_TICK_xau
```

Each match wakes the agent with the JSON `prompt` on that line (`run-agent-loop.sh` → **`XAU_TICK_PROMPT`**). The agent must read `context.json`, run **`xau-agent-brief.mjs`**, and paste the **full brief every tick** (see **AGENT-LOOP-PROMPT.md** — **do not go silent** on routine polls).

#### “Terminal shows analysis but the agent ignores it”

| Check | Action |
|-------|--------|
| JSON + `AGENT_LOOP_TICK_xau` in Terminal | Poll loop OK |
| No agent notification / no chat | **Monitoring missing** or on a **dead** shell |
| Restarted loop (exit **137** on old task) | Re-arm regex on the **new** background shell only |
| Chat only says “task result”, no Action/Why/When | Monitoring OK but wrong tick prompt or agent skipped brief | Restart loop from current **`run-agent-loop.sh`**; ask agent to start loop **with output monitoring** |

**If prices update in files but chat is silent:** the loop is fine — **monitoring is missing** or pointed at an **old dead terminal**. Restart the loop in a **new** background shell and re-arm the regex on **that** shell.

**After any loop restart:** always re-enable monitoring on the **new** terminal (old task IDs stop printing).

When asking the agent to restart the loop, say: **“start the loop with output monitoring on `^AGENT_LOOP_TICK_xau`”** so the wake is wired in the same step.

Alternative: Cursor **Automations** → trigger on `^AGENT_LOOP_TICK_xau` → instructions from [AGENT-LOOP-PROMPT.md](./AGENT-LOOP-PROMPT.md). See [CURSOR-AUTOMATION.md](./CURSOR-AUTOMATION.md).

### 4. Quick health check (no agent needed)

```bash
jq '{ts, m5: .m5.c, watch: .tradePlan.actionableWatch, ok: .dataIntegrity.ok}' \
  ~/.local/state/xau-scalp-agent/context.json
tail -3 ~/.local/state/xau-scalp-agent/signal-journal.md
```

---

## What you will get in chat

| Message | Meaning | You should |
|---------|---------|------------|
| **WATCH ONLY (Short/Long)** | Level + R:R idea to **monitor** — not “enter now” | **You** decide on MT5; see journal for logged levels |
| **Stand down** | Prior watch is **off** (zone/plan changed) | **Do not** chase old entry/stop/TP |
| **ENTER** (rare today) | All **hard filters** passed on a **closed 5m bar** | Still **recommendation only** — you execute on MT5. |
| **WAIT / WAIT_DATA** | No trade idea, bad feed, spread, or chop | **No new position** from automation. |

**Draft watch ≠ guaranteed win.** It is **level + R:R math**, same style as the short that worked from **~4049 → ~4045**.

---

## When to **sell (Short)** — “keep an eye” at the top

**Typical setup (what worked for you):**

1. **Price inside the M5 range-high / resistance zone** (near `nearestResistance`, often **~4049** area in recent sessions).
2. **M15 bias not bullish** (neutral or bear is enough for a **Short draft**).
3. Chat sends **Draft watch plan (Short)** with entry band, stop above the wick zone, TP1 toward **nearest support** (e.g. **~4045**).
4. **You enter** when price is still in the band and spread is acceptable (we cap at **50** points in filters).

**Do not short blindly if:**

- **`dataIntegrity.ok` is false** (legend stuck vs live quote — move mouse off chart).
- **Spread &gt; 50** on your broker.
- You already got **Do not enter** for that draft.

**After you skip or miss a short:** the loop sends **Do not enter** when price leaves the zone or the plan changes — **do not chase**.

---

## When to **buy (Long)** — at the bottom

**Typical setup:**

1. **Price in M15 / M5 support zone** (near `nearestSupport`).
2. **Strongest Long draft** often appears on a **new 5m bar close** with **bounce at support** (not every mid-bar tick — long watches are stricter than shorts unless M15 is bull).
3. Chat sends **Draft watch plan (Long)** with stop under structure, TP1 toward resistance.

**Do not buy blindly if:**

- Stop distance would exceed **1.2× M5 ATR** (plan shows `primary.ok: false` — no draft).
- **M5 ADX &lt; 20** — automation will **WAIT** on trend entries; draft may still appear for **watch only**.
- Same **integrity / spread / Do not enter** rules as shorts.

---

## When to **do nothing**

- No chat alert (routine **60s** ticks are often silent).
- **WAIT_DATA** / frozen TradingView legend (OHLC not updating).
- **Mid-range** between support and resistance (no zone).
- **News blackout** (`news.inBlackout`) — flat around high impact US events (e.g. FOMC).

---

## How filters relate to “full confirmation”

| Check | Draft watch in chat? | Automated **ENTER** in chat? |
|-------|----------------------|------------------------------|
| In S/R zone + R:R math | Often **yes** (Short at resistance especially) | **No** |
| M5 ADX ≥ 20 + closed-bar trigger + score | May overlap with draft | **Only then** (still not MT5 auto-order) |
| `dataIntegrity.ok` | Should wait for **true** before **you** trade | Required for ENTER |

Your winning trade used **draft watch + your entry** — that is the intended path until you enable stricter ENTER-only alerts.

---

## Tracking your signals

Every **new draft watch** and every **Do not enter** cancel is written automatically when the poll loop runs:

| File | Purpose |
|------|---------|
| **`~/.local/state/xau-scalp-agent/signal-journal.md`** | Human-readable log (read this to review days) |
| **`~/.local/state/xau-scalp-agent/signals.jsonl`** | One JSON line per alert (scripts / analysis) |
| **`~/.local/state/xau-scalp-agent/evaluations.jsonl`** | Agent **WAIT/ENTER** decisions on each **new 5m bar** |

Quick read:

```bash
less ~/.local/state/xau-scalp-agent/signal-journal.md
tail -5 ~/.local/state/xau-scalp-agent/signals.jsonl | jq .
```

Paths also appear in `context.json` → `paths.signals` and `paths.signalJournal`.

---

## Optional: log a manual fill

If you took a trade and want it in the journal, append an **enter** row (example):

```bash
node tools/xau-scalp-agent/server/xau-log-signal.mjs '{"type":"enter","ts":"2026-10-28T12:00:00.000Z","direction":"short","entryLow":4048.5,"entryHigh":4049,"stop":4049.7,"tp1":4045.3,"note":"Manual MT5 fill"}'
```

(Future: we can add a one-line “I entered” hook in chat if you want.)
