# Cursor hook: wake agent on XAU loop tick

**Master runbook:** [XAU-AGENT-LOOP.md](./XAU-AGENT-LOOP.md)

This repo uses **monitored shell output** (same pattern as YouTube `AGENT_LOOP_TICK_ytchat`).

## Start (test: 15s)

```bash
XAU_AGENT_LOOP_SEC=15 /var/www/ShadowAPI/tools/xau-scalp-agent/run-agent-loop.sh
```

Run in a **background terminal**. In Cursor Agent, start it **with output monitoring** on pattern:

```regex
^AGENT_LOOP_TICK_xau
```

**Critical:** monitoring must be on the **same** background shell that runs the loop. Starting the script without monitoring = terminal updates, **agent never analyzes**.

Each match runs the agent with the JSON `prompt` on that line (`run-agent-loop.sh` → **`XAU_TICK_PROMPT`**). The agent should paste **`xau-agent-brief.mjs`** (Action/Why/When) **every** tick — not “silent unless watch.”

**Suggested user message to Agent:**

```text
Start XAU loop with output monitoring on ^AGENT_LOOP_TICK_xau:
cd /var/www/ShadowAPI/tools/xau-scalp-agent && XAU_AGENT_LOOP_SEC=60 XAU_NTFY=1 ./run-agent-loop.sh
```

**Important:** Terminal JSON every minute ≠ agent received it. Monitoring must be on the **same live background shell** that runs the loop. After restart, re-arm on the **new** task ([XAU-AGENT-LOOP.md](./XAU-AGENT-LOOP.md#terminal-prints-ticks-but-the-agent-does-not-react-common-mistake)).

## Agent behavior

- Project rule: `.cursor/rules/xau-agent-loop.mdc`
- Checklist: `tools/xau-scalp-agent/AGENT-LOOP-PROMPT.md`

## Optional: Cursor Automation (UI)

If **Automations** are available in your Cursor build: create automation → **shell / terminal output** trigger → pattern `^AGENT_LOOP_TICK_xau` → instructions from `AGENT-LOOP-PROMPT.md` + rule above.

This session cannot open the Automations editor programmatically; the monitored shell loop is the local equivalent.

## Production interval

```bash
XAU_AGENT_LOOP_SEC=60 /var/www/ShadowAPI/tools/xau-scalp-agent/run-agent-loop.sh
```

Uses **`xau-watch-loop.mjs`**: single MCP connection, slim JSONL, auto-trim (`XAU_TICKS_MAX_LINES`, default 500), **`context.json`** for fast agent reads.
