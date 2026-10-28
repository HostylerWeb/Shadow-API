# ShadowAPI tools

Trading and browser-bridge tooling used with ShadowAPI / Cursor agent workflows.

| Directory | Purpose |
|-----------|---------|
| [chrome-agent-bridge](./chrome-agent-bridge/) | Chrome extension + MCP bridge (TradingView snapshots, tabs) |
| [xau-scalp-agent](./xau-scalp-agent/) | XAUUSD 5m/15m poll loop, levels, watches, agent protocol, **ntfy phone alerts** |

## XAU scalp quick links

- Runbook: [xau-scalp-agent/XAU-AGENT-LOOP.md](./xau-scalp-agent/XAU-AGENT-LOOP.md)
- Agent protocol: [xau-scalp-agent/AGENT-LOOP-PROMPT.md](./xau-scalp-agent/AGENT-LOOP-PROMPT.md)
- Phone alerts: [xau-scalp-agent/NTFY-PHONE-ALERTS.md](./xau-scalp-agent/NTFY-PHONE-ALERTS.md)

## State (not in git)

Runtime data stays on the machine:

- `~/.local/state/xau-scalp-agent/` — `context.json`, bars, ntfy topic config, etc.
- Chrome extension: load unpacked from `chrome-agent-bridge/extension` (sync Desktop copy if you use that path).
