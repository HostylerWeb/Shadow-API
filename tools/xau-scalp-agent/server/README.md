# XAU watch server
On the charts, add the 2 pine scripts. 5M chart: add Volume. 15M chart: add EMA 20/50/10/200
Polls **15m + 5m** TradingView tabs via the Chrome bridge and logs parsed legend data.

## Run

```bash
# Persistent loop (recommended) — one bridge connection, retention-aware JSONL
XAU_AGENT_LOOP_SEC=60 ../run-agent-loop.sh

# Single tick (connects/disconnects each run)
node xau-watch-tick.mjs
```

## Files

| File | Role |
|------|------|
| `xau-watch-loop.mjs` | Persistent poll + `AGENT_LOOP_TICK_xau` |
| `xau-watch-tick.mjs` | One-shot poll CLI |
| `xau-tick-core.mjs` | Shared snapshot + state writes |
| `xau-retention.js` | **Trim caps + bar-close archives** |
| `xau-store.js` | Bar detection, read/write helpers |
| `xau-store-paths.js` | Path constants |
| `parse-snapshot.js` | Parse OHLC + indicators from TV legend text |

| State | Path | Trim default |
|-------|------|----------------|
| Agent summary | `context.json` | never |
| Full snapshot | `latest.json` | never |
| Slim polls | `ticks.jsonl` | 500 lines |
| Closed 5m | `bars-5m.jsonl` | 96 bars (~8h) |
| Closed 15m | `bars-15m.jsonl` | 32 bars (~8h) |
| Decisions | `decisions.jsonl` | none (0 = off) |
| Status | `/tmp/xau-agent-status.json` | never |

See [../XAU-AGENT-LOOP.md](../XAU-AGENT-LOOP.md) for full retention policy.

Agent steps: [../AGENT-LOOP-PROMPT.md](../AGENT-LOOP-PROMPT.md)
