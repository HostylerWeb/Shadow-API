# XAU scalp — repeat checklist (what worked)

Use this when bringing the loop back after chart/layout/parser changes or a new machine.

## 1. TradingView layout (must match parser)

| Tab | Scripts | Notes |
|-----|---------|--------|
| **XAUUSD 5m** | `5-min.pine` + **Volume** (Ticks) | Pine **shorttitle** **`VWAP RSI ADX EMA`**. Enable **Agent Feed (Chrome bridge)** in indicator settings — legend must show **`XAUAGENT DayHi`** etc. (writes `levels-auto.json`). |
| **XAUUSD 15m** | `15-min.pine` + **EMA 20/50/100/200** | M15 **ADX+ATR** (or standalone ADX) parses via separate regex paths in `parse-snapshot.js`. |

- Keep **two Chrome tabs** open (5m + 15m), same broker symbol (e.g. OANDA XAUUSD).
- Legend must show **O H L C**, **SELL / spread / BUY**, and the indicator row with timezone (e.g. `America/New_York`) so regexes can anchor.

## 2. Bridge + poll loop

1. Chrome extension + bridge on `127.0.0.1:17321`. **Reload extension** after bridge updates (TradingView chart snapshot). If you load from **`~/Desktop/Chrome-Agent-Bridge`**, sync from `tools/chrome-agent-bridge/extension` after code changes (popup should show **v0.1.25+**).
2. Start from **Cursor Agent** as a **background** shell:

   ```bash
   XAU_AGENT_LOOP_SEC=60 /var/www/ShadowAPI/tools/xau-scalp-agent/run-agent-loop.sh
   ```

3. **Same background task:** output monitoring regex **`^AGENT_LOOP_TICK_xau`** — without this, terminal JSON every 60s does **not** wake the agent. See **[XAU-AGENT-LOOP.md § Terminal prints ticks but the agent does not react](./XAU-AGENT-LOOP.md#terminal-prints-ticks-but-the-agent-does-not-react-common-mistake)**.
4. **After any loop restart:** new shell + **re-arm monitoring** (old terminal exit **137** = dead).
5. Optional LLM-free alerts: `XAU_EMIT_NOTIFY=1` → loop prints `XAU_AGENT_CHAT` when watch/stand-down/WAIT_DATA.
6. Agent protocol on wake: [AGENT-LOOP-PROMPT.md](./AGENT-LOOP-PROMPT.md).

**One poll path:** `xau-watch-loop.mjs` → `xau-tick-core.mjs` → `snapshotTradingTabs()` → `parseTradingViewSnapshot(text)` → `latest.json` + `context.json` + bars/signals.

## 3. Prove parsing before trusting alerts

```bash
node tools/xau-scalp-agent/server/xau-watch-tick.mjs
jq '{m5: .m5, m15: .m15, di: .dataIntegrity.ok, agent: .levels.sources.agentFeedOk, watch: .levels.watch, plan: .tradePlan.role}' \
  ~/.local/state/xau-scalp-agent/context.json
jq '.agentFeed' ~/.local/state/xau-scalp-agent/levels-auto.json 2>/dev/null
```

**Healthy 5m snapshot** (example shape — values move with market):

- OHLC from legend `O … H … L … C …`
- **`m5.adx`** numeric (~14–30), not `null` ← was the main fix (Pine + `vwapRsiAdxEma` regex)
- **`m5.rsi`**, **`m5.spread`**, forming **`c`**
- **`dataIntegrity.ok: true`** (quote vs OHLC, M5/M15 **mid** alignment, bar-roll checks)

Full forming bar + all fields: `~/.local/state/xau-scalp-agent/latest.json`.

If **`m5.adx` is null**: re-add `5-min.pine`, confirm shorttitle in legend, run one manual tick and inspect raw snapshot length in parse output or bridge snapshot text.

## 4. Parser contract (`server/parse-snapshot.js`)

- **5m primary:** regex on legend block **`VWAP RSI ADX EMA`** → VWAP, RSI, RSI MA, **ADX**, **ATR**, EMA20, EMA50 (only when `detectTimeframe` → `"5m"`).
- **Fallbacks:** `ADX+ATR` row (typical **15m**), or `ADX 14` standalone.
- **Bar identity:** `barKey` = `5m:O|H|L|C` from legend — drives **new 5m bar** detection and **`bars-5m.jsonl`** archive.

After changing `parse-snapshot.js` or Pine legend layout: **restart the poll loop** so every tick uses the new code.

## 5. Why alerts matched the 4049 → 4045 drop (without false ENTER)

Stack that worked together:

1. **Levels** (`xau-levels.mjs` → `context.levels`): M5 **range high/low**, swings, distance zones; **`watch: true`** when mid is inside resistance/support zone (e.g. hugging **~4048.88–4049.33** range high).
2. **Trade plan** (`xau-trade-plan.mjs` → `context.tradePlan`): when **`actionableWatch`** + **`primary.ok`** (short at resistance), emit **`chatDraft`** only — **`enterAllowed` stays false** in JSON.
3. **Agent** (`.cursor/rules/xau-agent-loop.mdc` + prompt): on wake, paste **`chatDraft`** for watch; on **`isNew5mBar`**, append **`evaluations.jsonl`** via `xau-log-evaluation.mjs`; **never ENTER** from `tradePlan.primary.ok` alone.
4. **Hard filter that blocked auto-entry (correctly):** M5 **ADX &lt; 20** on **closed** bar → **WAIT** on trend_pullback long path; short fade was **watch math only** (no short playbook ENTER in automation yet).
5. **Mid-bar silence:** when price left the zone, **`levelsWatch: false`** → routine ticks need no chat spam.

TP1 on drafts tracked **`nearestSupport`** (e.g. **4045.32** → **4045.27** as M15 low updated) — that matched the live move toward **4046–4045**.

## 6. Files to touch when “doing it again”

| Change | Files |
|--------|--------|
| New indicator on 5m legend | `5-min.pine` + **`parse-snapshot.js`** (+ verify regex against real snapshot text) |
| S/R / watch rules | `xau-levels.mjs`, env `XAU_LEVELS_*` |
| Plan text / RR | `xau-trade-plan.mjs`, `XAU_MIN_NET_RR`, spread cap `XAU_SPREAD_MAX_POINTS` |
| Agent decisions | `AGENT-LOOP-PROMPT.md`, `XAU-SCALP-STUDY.md` §3.4 |

## 7. Quick regression after any edit

1. Manual tick → `context.json` **`m5.adx`** present.
2. Let one **5m bar close** → new line in **`bars-5m.jsonl`**, **`isNew5mBar`** in `/tmp/xau-agent-status.json`.
3. Price into a level zone → **`levels.watch`** + **`tradePlan.chatDraft`** if rules pass.
4. Agent tick → evaluation line in **`evaluations.jsonl`** on new bar only.

---

*Validated in live session: Oct 28, 2026 — M5 ADX ~16.7, integrity OK, resistance watch + short draft while price faded from 4048–4049 toward 4046–4045, WAIT on closed bars.*
