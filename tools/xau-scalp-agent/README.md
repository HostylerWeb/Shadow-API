# XAU Scalp Agent (TradingView + Chrome bridge)
On the charts, add the 2 pine scripts. 5M chart: add Volume. 15M chart: add EMA 20/50/10/200
Note: on the **5m** chart, add **`5-min.pine`** (legend shorttitle **VWAP RSI ADX EMA**) + Volume (Ticks). On **15m**, add **`15-min.pine`** + EMA 20/50/100/200. If `context.json` shows `m5.adx: null`, fix the 5m Pine/legend first — see **[PARSE-AND-LOOP-CHECKLIST.md](./PARSE-AND-LOOP-CHECKLIST.md)**.

Same **Chrome Agent Bridge** extension and WebSocket hub as YouTube chat (`tools/chrome-agent-bridge`). This folder reads **XAUUSD 15m + 5m** on TradingView, applies the **M15 bias / M5 execution** playbook, and alerts on setups — not live chat.

| Piece | Location |
|-------|----------|
| Extension + `ws://127.0.0.1:17321/extension` | `tools/chrome-agent-bridge/extension` |
| Bridge hub | `tools/chrome-agent-bridge/server/bridge.js` (or shared systemd unit) |
| **Strategy & playbook (read first)** | [XAU-SCALP-STUDY.md](./XAU-SCALP-STUDY.md) |
| Strategy & when to buy/sell + **start loop + agent wake** | **[SIGNAL-RECOMMENDATIONS.md](./SIGNAL-RECOMMENDATIONS.md)** |
| **Agent loop runbook (setup, files, troubleshooting)** | **[XAU-AGENT-LOOP.md](./XAU-AGENT-LOOP.md)** — read **“Terminal prints ticks but the agent does not react”** if the loop runs but chat ignores ticks |
| **Phone alerts (ntfy)** | **[NTFY-PHONE-ALERTS.md](./NTFY-PHONE-ALERTS.md)** |
| Agent tick checklist | [AGENT-LOOP-PROMPT.md](./AGENT-LOOP-PROMPT.md) |
| Cursor wake / Automations | [CURSOR-AUTOMATION.md](./CURSOR-AUTOMATION.md) |
| Watch server detail | [server/README.md](./server/README.md) |
| Future MCP / chart scrape | `server/` (see server README) |

## How it connects (today vs next)

**Today:** Poll loop uses **`tradingviewChart`** snapshots (same extension) + **5m Pine `XAUAGENT`** session levels → **`levels-auto.json`**. MCP tool **`chrome_tradingview_chart`** for manual checks. Optional **`node server/xau-agent-notify.mjs`** for LLM-free chat lines. **`XAU_NTFY=1`** pushes watch/stand-down/ENTER to your phone — see **[NTFY-PHONE-ALERTS.md](./NTFY-PHONE-ALERTS.md)**.

**Planned:** Further TV DOM tools (timeframe sync) if legend targeting still drifts.

## Before we tune anything in chat

Read **[XAU-SCALP-STUDY.md](./XAU-SCALP-STUDY.md)** end to end. It answers:

1. Which TradingView indicators to add (and why)  
2. Buy/sell strategy rules  
3. Candle + structure reading and **M15/M5** confirmation  
4. Entry, exit, invalidation, and session filters  

After that, align your **15m + 5m** chart layout, broker, and automation scope.

## Install (reuse YouTube bridge)

1. Extension loaded from `tools/chrome-agent-bridge/extension` (or your Desktop copy).  
2. Bridge running on `127.0.0.1:17321`.  
3. Open TradingView → **XAUUSD** (your broker symbol, e.g. `OANDA:XAUUSD` or `PEPPERSTONE:XAUUSD`).  
4. Apply the indicator stack from the study doc; save as a layout named e.g. `XAU-SCALP-M5M15`.

No separate Chrome extension is required for v0.
