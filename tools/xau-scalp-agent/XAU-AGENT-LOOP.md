# XAU agent loop — runbook (don’t forget)

Everything needed to run, monitor, tune, and troubleshoot the **TradingView → bridge → state files → Cursor agent** scalp loop. Strategy rules live in [XAU-SCALP-STUDY.md](./XAU-SCALP-STUDY.md); this doc is **operations only**.

---

## What we built (mental model)

Two separate jobs:

| Job | What | If it stops |
|-----|------|-------------|
| **Poll loop** | Pulls 5m + 15m chart legend from Chrome every N seconds, writes JSON state | Files stop updating; agent has stale prices |
| **Agent wake** | Cursor sees `AGENT_LOOP_TICK_xau` in terminal output (or Automation) and runs the agent | Files update but **nobody replies in chat** |

The poll loop **does not** message you in chat by itself. **Two things** must both be true: (1) **`AGENT_LOOP_TICK_xau`** wakes the agent via **output monitoring** on the live loop shell, and (2) the agent follows **`AGENT-LOOP-PROMPT.md`** + **`run-agent-loop.sh`** `XAU_TICK_PROMPT` — **full brief every tick**, not “silent unless watch.”

---

## Terminal prints ticks but the agent does not react (common mistake)

You may see this **every ~60s** in a Cursor terminal:

```text
{"ok":true,"ts":"...","m5":{"c":4041.5,...}}
AGENT_LOOP_TICK_xau {"prompt":"..."}
```

That means the **poll loop is healthy**. It does **not** mean the **chat agent** received anything.

| What you see | What it means |
|--------------|----------------|
| JSON summary line | Node wrote state to `context.json` / `ticks.jsonl` |
| `AGENT_LOOP_TICK_xau` | A **hook line** for Cursor — useless unless **output monitoring** is armed on **this** background shell |
| Agent silent for many ticks | **Bug** if monitoring is armed — agent should paste **`xau-agent-brief.mjs`** each wake. Old **`XAU_TICK_PROMPT`** with “Else silent unless watch” caused one-line stubs; fixed in **`run-agent-loop.sh`**. |
| Old task **exit 137** | Old loop was killed; monitoring on that terminal ID is **dead** |

### Required: monitor the **live** loop shell

1. Start the loop from **Cursor Agent** as a **background** task (not a one-shot command that exits).
2. On **that same background task**, enable **output monitoring** with regex:

   ```regex
   ^AGENT_LOOP_TICK_xau
   ```

3. Each match should spawn an agent turn (you may see a short system notification). The agent reads `context.json` and only **messages you in chat** when [AGENT-LOOP-PROMPT.md](./AGENT-LOOP-PROMPT.md) says to.

4. **Every time you restart the loop** (`pkill`, new agent session, or “restart the loop”):  
   - Start a **new** background shell.  
   - **Re-arm** monitoring on the **new** task — **never** the old terminal (e.g. 899104 after restart → use 899105).

5. **Wrong:** Loop running in an external terminal, or a background shell **without** monitoring — files update, chat agent never wakes.

6. **Optional:** Ask the agent to “start the XAU loop **with output monitoring** on `^AGENT_LOOP_TICK_xau`” so monitoring is attached when the shell starts.

7. **Optional (no LLM):** `XAU_EMIT_NOTIFY=1` on the loop prints `XAU_AGENT_CHAT` lines when there is a watch/stand-down/WAIT line (`server/xau-agent-notify.mjs`).

8. **Phone alerts (ntfy):** See **[NTFY-PHONE-ALERTS.md](./NTFY-PHONE-ALERTS.md)**. Summary: with `XAU_NTFY=1` (default in `run-agent-loop.sh`), the loop POSTs to local ntfy on **`:2586`** for **new WATCH ONLY**, **stand-down**, **ENTER** (evaluation log), or **bridge error**. Setup: `node server/xau-ntfy-push.mjs --setup` · test: `--test` · off: `XAU_NTFY=0`.

**Quick test:** `tail -1 ~/.local/state/xau-scalp-agent/ticks.jsonl` — if `ts` advances every ~60s but you get **no** agent notifications, fix **monitoring**, not TradingView.

See also: [SIGNAL-RECOMMENDATIONS.md § Connect terminal → agent](./SIGNAL-RECOMMENDATIONS.md#3-connect-terminal--agent-so-i-report-back).

---

## Prerequisites (once per machine)

1. **Chrome extension** loaded from `tools/chrome-agent-bridge/extension` (same as YouTube stack).
2. **Bridge hub** listening on `ws://127.0.0.1:17321` (`tools/chrome-agent-bridge/server/bridge.js` or your systemd unit).
3. **TradingView** in Chrome:
   - Two tabs (or windows): **XAUUSD 5m** and **XAUUSD 15m** (broker symbol e.g. `OANDA:XAUUSD`).
   - Indicator stack from [XAU-SCALP-STUDY.md](./XAU-SCALP-STUDY.md); Pine scripts in this folder: `5min.pine`, `1min.pine` (optional manual M1 — loop uses **5m + 15m** only).
4. Extension connected (bridge health optional: `http://127.0.0.1:17320/health` if health server is up).

---

## Start the loop

### Production (recommended): every 60 seconds

```bash
XAU_AGENT_LOOP_SEC=60 /var/www/ShadowAPI/tools/xau-scalp-agent/run-agent-loop.sh
```

### Test: faster interval

```bash
XAU_AGENT_LOOP_SEC=15 /var/www/ShadowAPI/tools/xau-scalp-agent/run-agent-loop.sh
```

### Single poll (debug, no loop)

```bash
node /var/www/ShadowAPI/tools/xau-scalp-agent/server/xau-watch-tick.mjs
```

**Implementation:** `run-agent-loop.sh` runs **`server/xau-watch-loop.mjs`** — one persistent MCP connection to the bridge (fast), not reconnect every tick.

### Start **and** connect the agent (copy this request)

Ask Cursor Agent:

> Start the XAU loop in a **background** shell with **output monitoring** on regex **`^AGENT_LOOP_TICK_xau`**, using:
> `cd /var/www/ShadowAPI/tools/xau-scalp-agent && XAU_AGENT_LOOP_SEC=60 XAU_NTFY=1 ./run-agent-loop.sh`

The agent must attach monitoring **when starting** the shell (not only run the script). Without monitoring, the terminal prints `AGENT_LOOP_TICK_xau` every ~60s but **chat never analyzes** the data.

**Verify connection:** you should get an agent turn ~every 60s with **Action / Why / When** (from the brief), not only “task result” one-liners.

---

## Connect Cursor so the agent actually wakes

**Full step-by-step also in [SIGNAL-RECOMMENDATIONS.md](./SIGNAL-RECOMMENDATIONS.md#start-the-tool-and-connect-it-to-the-agent-chat).**

### Option A — Monitored shell (local, recommended for 60s)

1. Start the loop from **Cursor Agent** as a **background** shell task.
2. Enable **output monitoring** with regex:

   ```regex
   ^AGENT_LOOP_TICK_xau
   ```

3. Each match should pass the JSON **`prompt`** on that line to the agent.

Same pattern as YouTube **`AGENT_LOOP_TICK_ytchat`**.

### Option B — Cursor Automations (UI)

If your Cursor build has Automations:

- **Trigger:** terminal / shell output matching `^AGENT_LOOP_TICK_xau`
- **Instructions:** [AGENT-LOOP-PROMPT.md](./AGENT-LOOP-PROMPT.md) + project rule `.cursor/rules/xau-agent-loop.mdc`
- **Still run** `run-agent-loop.sh` in a long-lived terminal (Automations wake the agent; they don’t poll TradingView unless you add that separately).

Cron-only schedules are **≥ 1 minute** — use the shell loop for **60s** (or 15s test).

More notes: [CURSOR-AUTOMATION.md](./CURSOR-AUTOMATION.md).

---

## What the agent reads each tick

Read in this order (paths default under `~/.local/state/xau-scalp-agent/`):

| File | Purpose |
|------|---------|
| **`context.json`** | **Start here** — flags, **`levels`**, **`tradePlan`** (entry/stop/TP), `signal`, `limits`, **`news`**, paths |
| **`latest.json`** | Full parse: OHLC, EMAs, VWAP, ATR, bid/ask, tab ids |
| **`ticks.jsonl`** (last ~3 lines) | Slim **poll** history (intra-bar drift) |
| **`bars-5m.jsonl`** / **`bars-15m.jsonl`** (last ~8–12 lines) | **Closed** bar OHLC + indicators (decision-grade structure) |
| **`/tmp/xau-agent-status.json`** | `ok`, errors, same flags as context |

Agent checklist (authoritative): **[AGENT-LOOP-PROMPT.md](./AGENT-LOOP-PROMPT.md)** overrides study if they conflict.

### When the agent should message you

On **every** `AGENT_LOOP_TICK_xau` wake (when monitoring is connected):

- Paste **`node …/xau-agent-brief.mjs`** output (or **`XAU_AGENT_BRIEF_START` … `END`** from the terminal) — **Action / Why / When / Price**.
- On **`isNew5mBar`**, also append **`evaluations.jsonl`** via **`xau-log-evaluation.mjs`**.
- If **`watchRevoked.notify`**, paste **`chatDoNotEnter`** first.
- **ENTER** in chat only after all hard filters + score (rare); **`tradePlan.primary.ok` alone is never ENTER**.

Phone **ntfy** is separate (watch / stand-down / ENTER / bridge error only) — see [NTFY-PHONE-ALERTS.md](./NTFY-PHONE-ALERTS.md).

Trading logic: **M15 bias + M5 closed-bar execution** — [XAU-SCALP-STUDY.md](./XAU-SCALP-STUDY.md). ENTER uses **`bars-5m.jsonl`**, not forming `latest.json`.

---

## State files (where data goes)

Default directory: **`~/.local/state/xau-scalp-agent/`**  
Override: `XAU_SCALP_STATE_DIR=/path/to/dir`

| File | Updated | Contents |
|------|---------|----------|
| `context.json` | Every poll | Agent-oriented summary (read first); includes **`levels`** |
| `levels.json` | Optional manual | `{ "supports": [], "resistances": [] }` merged into **`context.levels`** |
| `latest.json` | Every poll | Full 5m + 15m snapshot + `bucket5m` / `bucket15m` |
| `ticks.jsonl` | Every poll (append) | **Slim** poll lines; trimmed (see retention) |
| `bars-5m.jsonl` | On **new 5m bucket** | Closed 5m bar snapshot from previous poll |
| `bars-15m.jsonl` | On **new 15m bucket** | Closed 15m bar snapshot from previous poll |
| `decisions.jsonl` | Manual / future | ENTER and setup journal (append-only) |
| `news-calendar.json` | Every **10** loop ticks (default) | US/EU high-impact macro + blackout flags |
| `/tmp/xau-agent-status.json` | Every poll | Heartbeat; override with `XAU_AGENT_STATUS_PATH` |

**Every poll writes all of the above** (except decisions). “Something new” is recorded as **`isNew5mBar`** / **`isNew15mBar`** inside those files, not a separate file.

### Retention (implemented in `server/xau-retention.js`)

**Never trimmed:** `latest.json`, `context.json`, `/tmp/xau-agent-status.json` (always one snapshot).

**Trim = keep last N lines** (tail rewrite; oldest lines dropped):

| File | Default cap | What gets removed | What you keep |
|------|-------------|-------------------|---------------|
| **`ticks.jsonl`** | **500** lines | Oldest slim poll rows | ~12.5h @ 90s — same-bar drift + session narrative |
| **`bars-5m.jsonl`** | **96** lines | Oldest closed 5m bars | **8 hours** of 5m structure (OHLC, RSI, EMA, spread, …) |
| **`bars-15m.jsonl`** | **32** lines | Oldest closed 15m bars | **8 hours** of 15m bias context |
| **`decisions.jsonl`** | **0** (= no trim) | Nothing by default | All ENTER / setup notes |

**What we do *not* put in `ticks.jsonl`:** full OHLC/EMA blobs — those live in **`latest.json`** (live) and **`bars-*.jsonl`** (on bar close).

**When bar archives append:** on `isNew5mBar` / `isNew15mBar`, the **previous** bar from `latest.json` (pre-update) is copied into `bars-5m.jsonl` or `bars-15m.jsonl`, then that file is trimmed to its cap.

Current caps are echoed in **`context.json`** → `retention` on each poll.

Long-term trade history → **`decisions.jsonl`** (or a future DB), not raw ticks.

---

## Environment variables

| Variable | Default | Meaning |
|----------|---------|---------|
| `XAU_AGENT_LOOP_SEC` | `60` | Seconds between polls (min 5 in loop) |
| `XAU_TICKS_MAX_LINES` | `500` | Max lines in `ticks.jsonl` |
| `XAU_BARS_5M_MAX_LINES` | `96` | Max closed 5m bars (~8h) |
| `XAU_BARS_15M_MAX_LINES` | `32` | Max closed 15m bars (~8h) |
| `XAU_DECISIONS_MAX_LINES` | `0` | Max decision lines; **0 = never trim** |
| `XAU_SCALP_STATE_DIR` | `~/.local/state/xau-scalp-agent` | State directory |
| `XAU_AGENT_STATUS_PATH` | `/tmp/xau-agent-status.json` | Status JSON path |
| `XAU_TICK_PROMPT` | (built-in) | JSON prompt on `AGENT_LOOP_TICK_xau` line |
| `CHROME_BRIDGE_PORT` | `17321` | Bridge WebSocket port |
| `XAU_CALENDAR_EVERY_N_TICKS` | `10` | Refresh Finance Calendar JSON every N loop ticks |
| `XAU_CALENDAR_API_URL` | `https://www.financecalendar.com/wp-json/fc/v1/calendar-view` | Weekly macro calendar (JSON). **Not** `/api/forex-calendar/` (HTML). |
| `XAU_NEWS_BLACKOUT_MIN` | `30` | Minutes ± release for `inBlackout` on high/critical events |
| `XAU_NEWS_LOOKAHEAD_HOURS` | `72` | Include events this far ahead |

### News calendar

- **Fetch manually:** `node tools/xau-scalp-agent/server/xau-fetch-calendar.mjs`
- **In loop:** first tick + every 10th tick → `news-calendar.json`, merged into **`context.json` → `news`**
- **Agent:** if `news.inBlackout` → hard filter **FLAT**; if fetch failed → **UNKNOWN** (see AGENT-LOOP-PROMPT)

---

## Code map (when you change things)

| File | Role |
|------|------|
| `run-agent-loop.sh` | Entry: `exec node server/xau-watch-loop.mjs` |
| `server/xau-watch-loop.mjs` | Persistent loop, prints summary + `AGENT_LOOP_TICK_xau` |
| `server/xau-watch-tick.mjs` | One-shot poll CLI |
| `server/xau-tick-core.mjs` | Snapshot tabs, parse, write state |
| `server/xau-store.js` | Bar detection, read/write helpers |
| `server/xau-store-paths.js` | State file paths |
| `xau-forex-calendar.mjs` | Finance Calendar fetch + `news-calendar.json` |
| `xau-fetch-calendar.mjs` | One-shot calendar CLI |
| `server/parse-snapshot.js` | TradingView legend text → OHLC/indicators |
| `.cursor/rules/xau-agent-loop.mdc` | Cursor rule when tick fires |
| `AGENT-LOOP-PROMPT.md` | Short agent steps per wake |

---

## Optimizations already in place (Grade A+ stack)

1. **Persistent bridge** in `xau-watch-loop.mjs` — one `MCP attached` per session; polls typically tens of ms.
2. **`context.json`** — agent reads a small file first instead of parsing fat logs.
3. **Slim `ticks.jsonl`** — compact lines; full OHLC stays in `latest.json`.
4. **Auto-trim** — `ticks.jsonl` capped at 500 lines (configurable).
5. **Fixed `isNew5mBar`** — true only when the 5m **clock bucket** changes (not on every poll).
6. **Clear failure** if no 5m/15m TradingView tabs are open.

---

## Stop / restart

**Stop:**

- Ctrl+C in the loop terminal, or
- `pkill -f xau-watch-loop.mjs` / `pkill -f run-agent-loop.sh`

**Restart (production):**

```bash
XAU_AGENT_LOOP_SEC=60 /var/www/ShadowAPI/tools/xau-scalp-agent/run-agent-loop.sh
```

Re-arm **output monitoring** on `^AGENT_LOOP_TICK_xau` if you start from a fresh Agent session.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| JSON + `AGENT_LOOP_TICK_xau` in terminal but **no agent wake / no chat** | Loop OK; **output monitoring** not armed on **live** background shell | Regex `^AGENT_LOOP_TICK_xau` on **current** loop task; see [§ Terminal prints ticks…](#terminal-prints-ticks-but-the-agent-does-not-react-common-mistake) |
| Agent wakes but only **“task result”** one-liners, no brief | Old **`XAU_TICK_PROMPT`** or agent ignoring rule | Use current **`run-agent-loop.sh`**; rule **`.cursor/rules/xau-agent-loop.mdc`** requires full brief every tick |
| Monitoring on **old** terminal after restart | Loop on new shell, wake still on dead task | Re-arm `^AGENT_LOOP_TICK_xau` on the **new** background shell only |
| JSON in terminal but no agent replies (old wording) | No output monitoring / Automation | Arm regex `^AGENT_LOOP_TICK_xau` or Automation trigger |
| `ok: false` / bridge error | Extension disconnected or bridge down | Reload extension; start bridge on 17321 |
| Error: no 5m/15m tabs | Wrong tabs or symbol | Open XAUUSD **5m** and **15m** on TradingView |
| `isNew5mBar` every tick (old bug) | Stale `latest.json` without buckets | Fixed in `xau-store.js`; delete state dir or let one poll rewrite |
| Stale prices | Loop not running | Restart `run-agent-loop.sh` |
| `[bridge] MCP attached` every 15s (old) | Old bash loop spawning one-shot ticks | Use current `run-agent-loop.sh` → persistent loop |

**Inspect quickly:**

```bash
cat ~/.local/state/xau-scalp-agent/context.json
cat /tmp/xau-agent-status.json
tail -5 ~/.local/state/xau-scalp-agent/ticks.jsonl
```

---

## Later ideas (not implemented)

- Append **ENTER** lines automatically to `decisions.jsonl` from agent tool
- Dedicated XAU MCP server (see [README.md](./README.md) “Planned”)
- Slack/Telegram alert on ENTER
- SQLite journal beside JSONL

---

## Quick copy-paste (daily use)

```bash
# 1) Bridge + Chrome + TV 5m/15m tabs open

# 2) In Cursor Agent: start BACKGROUND shell (keeps running):
XAU_AGENT_LOOP_SEC=60 /var/www/ShadowAPI/tools/xau-scalp-agent/run-agent-loop.sh

# 3) On THAT background task: enable output monitoring, regex:
#    ^AGENT_LOOP_TICK_xau
#    → agent wakes ~every 60s and replies when watch / stand-down / bar / error

# 4) After restart: new background shell + re-arm monitoring (old terminal is dead)

# 5) You execute on MT5 yourself; journal: ~/.local/state/xau-scalp-agent/signal-journal.md
```
