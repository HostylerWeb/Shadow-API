#!/usr/bin/env bash
# Persistent Node loop: one bridge connection, trimmed JSONL, AGENT_LOOP_TICK_xau for Cursor.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
INTERVAL="${XAU_AGENT_LOOP_SEC:-60}"

export XAU_AGENT_LOOP_SEC="$INTERVAL"
export XAU_NTFY="${XAU_NTFY:-1}"
export XAU_TICK_PROMPT="${XAU_TICK_PROMPT:-AGENT_LOOP_TICK_xau: Follow .cursor/rules/xau-agent-loop.mdc and AGENT-LOOP-PROMPT.md. Read ~/.local/state/xau-scalp-agent/context.json (dataIntegrity, levels, tradePlan, watchRevoked, news). Every tick: run node $ROOT/server/xau-agent-brief.mjs and paste the full brief (Action/Why/When) to the user — or copy the XAU_AGENT_BRIEF block from this terminal. On isNew5mBar: append evaluations.jsonl via xau-log-evaluation.mjs. Hard filters before score; never ENTER from primary.ok alone. If watchRevoked.notify, paste chatDoNotEnter first.}"

exec node "$ROOT/server/xau-watch-loop.mjs"
