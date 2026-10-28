# Local LLM agent (replace Cursor on the live loop)

This document is the plan to **keep the current XAU scalp infrastructure and logic unchanged**, and swap **only the decision step** that today runs in **Cursor** (on `AGENT_LOOP_TICK_xau`) for a **local LLM** (Ollama on Linux) that **reads the same state**, **applies the same protocol**, and drives **the same notifications** you already use.

Strategy rules stay in [XAU-SCALP-STUDY.md](./XAU-SCALP-STUDY.md). Agent behavior stays aligned with [AGENT-LOOP-PROMPT.md](./AGENT-LOOP-PROMPT.md). Operations stay in [XAU-AGENT-LOOP.md](./XAU-AGENT-LOOP.md) and [NTFY-PHONE-ALERTS.md](./NTFY-PHONE-ALERTS.md).

---

## Goal

| Today | Target |
|-------|--------|
| Node loop writes state every ~60s | **Same** |
| Watches, stand-down, ntfy, journal, `evaluations.jsonl` | **Same** |
| **Cursor** wakes on `AGENT_LOOP_TICK_xau`, reads `context.json`, decides, logs eval, user sees chat | **Local LLM** runs on **defined events**, reads the **same JSON**, decides, logs eval, **ntfy** (no Cursor burn) |

You are happy with outcomes **when the protocol is followed**; the local model’s job is to **read and analyze before we notify or record a decision** — not to replace Pine, the bridge, or level math.

**Non-goals:** Do **not** reimplement strategy in Python. Do **not** port `xau-levels`, trade plan, or watch math to another language. Do **not** change when watches fire or how S/R is computed. The local layer only **reads** existing JSON and **acts** via existing `.mjs` tools.

---

## What stays the same vs what changes

### Stays the same

**Charts and data**

- TradingView **5m + 15m**, Pine scripts, Chrome extension, bridge on **17321**
- **60s poll** via `run-agent-loop.sh` → `xau-watch-loop.mjs`

**All trading math and rules (Node — untouched)**

- `xau-tick-core.mjs` — poll, bars, `dataIntegrity`
- `xau-levels.mjs` — S/R, zones, rejection/bounce, M15 bias
- `xau-trade-plan.mjs` — entry/stop/TP math; **`enterAllowed` still false** in JSON
- `xau-watch-track.mjs` — watch issue/revoke, cooldown, hysteresis, integrity gate for watches
- `xau-signal.js` — signal id, stale slip/age
- FOMC / calendar fetch into `context.json`

**State and logs**

- Paths under `~/.local/state/xau-scalp-agent/` (`context.json`, bars, `signals.jsonl`, journal, etc.)
- **`xau-agent-brief.mjs`** — same text generator (optional append to `brief.log`)

**Phone alerts (transport)**

- ntfy on **:2586**, same topics and dedupe
- Same **kinds** of messages: prepare, stand down, rare ENTER review, bridge error

**Strategy documents**

- [XAU-SCALP-STUDY.md](./XAU-SCALP-STUDY.md), [AGENT-LOOP-PROMPT.md](./AGENT-LOOP-PROMPT.md) — **no strategy rewrite**; the LLM prompt **follows** these

**You on MT5**

- Still **you** execute; nothing auto-orders

### Changes

**Who decides (replaces Cursor)**

| Before | After |
|--------|--------|
| Cursor wakes on `AGENT_LOOP_TICK_xau` (~every minute), reads files, decides, token cost | **Local agent** (Python or thin Node sidecar) + **Ollama** on **events** (new 5m bar, watch, revoke, bad data) — **no Cursor on the loop** |

**Loop configuration**

- **`XAU_CURSOR_WAKE=0`** — no `AGENT_LOOP_TICK_xau` in production (planned flag)
- **`XAU_LOCAL_AGENT=1`** — run the new decision step after each tick (or on events)

**New code (orchestration only — not new strategy)**

- Local agent: build JSON packet from `context.json` + bars → **Ollama** → validate JSON
- **Hard gates in code** (same rules as the prompt; model cannot override bad integrity/spread/stale)
- Invoke **existing** `xau-log-evaluation.mjs` and ntfy (same as Cursor did manually)

**Optional delivery tweak (same underlying logic)**

- **ntfy “prepare”** may wait for **LLM approve** + gates, not only raw `newWatchIssued` (fewer bad pings; Node still computes watches the same way)

**What you stop**

- Cursor **output monitoring** on the loop terminal for live trading
- **~1,440 agent turns/day** for routine “wait” ticks

**What you still do sometimes**

- Open **Cursor** to edit code/docs, review journal, tune prompts — **not** wired to every poll

### One-line summary

| | Same | Changes |
|---|------|--------|
| **Pipeline** | TV → bridge → Node → files → watches → ntfy | — |
| **Strategy / levels / watches** | 100% current Node + study | — |
| **Decision brain** | — | Cursor → **local LLM + gates** |
| **Cost / chat** | Phone + logs | No live Cursor loop |

**Python vs Node** for the new step is an **implementation choice only**. It does **not** mean reimplementing levels or trade plan in Python. Preferred layout if using Python:

```text
run-agent-loop.sh          ← unchanged Node loop
python xau_local_agent.py  ← watches events, Ollama, subprocess to existing .mjs
```

---

## What we have now (~90% platform)

### Data path (unchanged)

```text
TradingView (5m + 15m) → Chrome extension → ws://127.0.0.1:17321
  → xau-watch-loop.mjs (run-agent-loop.sh)
  → ~/.local/state/xau-scalp-agent/
       context.json, latest.json, ticks.jsonl
       bars-5m.jsonl, bars-15m.jsonl
       signals.jsonl, signal-journal.md, evaluations.jsonl
```

### Logic already in Node (unchanged)

| Module | Role |
|--------|------|
| `xau-tick-core.mjs` | Poll, archive bars, `dataIntegrity`, levels, trade plan, signal on new M5 |
| `xau-levels.mjs` | S/R, zones, `consider`, closed-bar rejection/bounce |
| `xau-trade-plan.mjs` | Entry/stop/TP math; **`enterAllowed` always false** in JSON |
| `xau-watch-track.mjs` | Active watch, revoke, cooldown, hysteresis; gates watch ntfy on integrity |
| `xau-agent-brief.mjs` | Plain-language **Action / Why / When** (display/log) |
| `xau-ntfy-push.mjs` | Phone: watch, stand-down, ENTER (from eval), bridge error |
| `xau-log-evaluation.mjs` | Append `evaluations.jsonl`, mark signal processed, optional ENTER ntfy |
| `xau-agent-notify.mjs` | Optional deterministic lines (no LLM) |

### What Cursor was doing (to be replaced)

On each wake (previously every ~60s with monitoring):

1. Read `AGENT-LOOP-PROMPT.md` + `context.json` (+ bars when needed).
2. Apply **hard filters first**, then score; never ENTER from `primary.ok` alone.
3. Paste **`xau-agent-brief.mjs`** output (or equivalent).
4. On **`isNew5mBar`**, append **`evaluations.jsonl`** via `xau-log-evaluation.mjs`.
5. On watch / stand-down, respect **`watchRevoked`** and **`chatDraft`** rules.

**Cost problem:** ~1,440 Cursor agent turns/day if monitoring fires every poll.

---

## Best plan (summary)

```text
[UNCHANGED] Node loop + watches + ntfy transport + state files
[NEW]       Local agent step after each tick (or on events)
              → build packet from context + bars
              → hard gates in code (non-negotiable)
              → Ollama: read, analyze, output JSON decision
              → validate JSON + gates again
              → evaluations.jsonl + ntfy (same titles as today)
[OFF]       AGENT_LOOP_TICK_xau / Cursor monitoring in production
```

**Principle:** **Same infrastructure, same logic.** Code enforces what must never be wrong (integrity, spread, stale, blackout). The **local LLM analyzes** and chooses among **allowed** outcomes and **wording** — like Cursor did — before we notify or log.

Optional later: deterministic **score** in Node identical to the prompt; LLM only on **borderline** or for message text. Phase 1 can mirror current Cursor behavior with LLM + strict gates.

---

## When the local LLM runs

Avoid calling the model on every silent poll unless you explicitly want that (CPU cost on a 7B model).

| Trigger | Call LLM? | Typical decision |
|---------|-----------|------------------|
| Routine poll, nothing special | **Skip** (optional: append brief to log only) | — |
| **`newWatchIssued`** | **Yes** | Approve **WATCH ONLY** ntfy or suppress |
| **`watchRevoked.notify`** | **Yes** | **Stand down** / exit hint |
| **`isNew5mBar`** and **`m5ArchiveOk`** | **Yes** | WAIT / WAIT_DATA / rare **ENTER** review |
| **`dataIntegrity.ok === false`** on roll | **Yes** (or template only) | WAIT_DATA; no trade |
| **`news.inBlackout`** | **Yes** (or template) | FLAT |

Target: **~12–30 LLM calls/hour** in active conditions, not **~60/hour** unless you opt in.

---

## Local LLM stack

| Item | Recommendation |
|------|----------------|
| Runtime | **Ollama** on Linux (`http://127.0.0.1:11434`) |
| Model | **`qwen2.5:7b-instruct`** (CPU ~15 GiB RAM); upgrade to **14B** or GPU if available |
| Implementation | **Node** (`xau-local-agent.mjs`) preferred — same repo as loop; **Python sidecar** OK if you prefer |
| Protocol | System prompt = condensed **AGENT-LOOP-PROMPT** + “output **only JSON**” |
| Safety | **Hard gates in code** before and after LLM; model cannot override failed integrity |

Env vars (planned):

| Variable | Purpose |
|----------|---------|
| `XAU_LOCAL_AGENT=1` | Enable local agent step |
| `XAU_CURSOR_WAKE=0` | Do not print `AGENT_LOOP_TICK_xau` (production) |
| `OLLAMA_HOST` | Default `http://127.0.0.1:11434` |
| `OLLAMA_MODEL` | Default `qwen2.5:7b-instruct` |
| `XAU_LOCAL_AGENT_EVENTS` | Optional filter: `watch,revoke,bar,integrity` |

---

## Decision JSON (contract)

The local agent returns one object per invocation (schema validated in code):

```json
{
  "decision": "WAIT | WAIT_DATA | FLAT | APPROVE_WATCH | STAND_DOWN | EXIT_REVIEW | ENTER_REVIEW",
  "notify": true,
  "direction": "long | short | null",
  "score": 0,
  "reasons": ["short bullet strings"],
  "body": "Markdown/plain text for phone and journal",
  "signalId": "from context.signal when present"
}
```

**Mapping to today’s behavior:**

| `decision` | Phone (ntfy) | Same as today |
|------------|--------------|----------------|
| `APPROVE_WATCH` | **XAU - WATCH ONLY (prepare)** | New watch after LLM approval |
| `STAND_DOWN` | **XAU - stand down** | Watch revoked |
| `EXIT_REVIEW` | **XAU - stand down** (or dedicated title) | “Close / don’t hold” if idea invalidated |
| `ENTER_REVIEW` | **XAU - ENTER (review now)** | Rare; all hard filters passed |
| `WAIT` / `WAIT_DATA` / `FLAT` | No notify (log only) | Most 5m closes |

**Recommendation only — you execute on MT5** (unchanged).

---

## Hard gates (code wins over LLM)

These match [AGENT-LOOP-PROMPT.md](./AGENT-LOOP-PROMPT.md). If any fail, force **`WAIT_DATA`** or **`WAIT`**, **`notify: false`**, regardless of model output:

1. `context.dataIntegrity.ok === false` or `m5ArchiveOk === false` on bar decisions.
2. Spread &gt; `limits.spreadMaxPoints` (default 50).
3. `signal.staleByAge` or `signal.staleBySlip` when `signal` present.
4. `news.inBlackout === true` → **FLAT**.
5. **`tradePlan.primary.ok` / `meetsMinRR` alone** → never **ENTER_REVIEW**.
6. S/R and triggers from **`context.levels`** and **closed bars** only — if LLM contradicts archived facts, reject notify.
7. Watch ntfy: same as today — integrity OK, anti-flap rules in `xau-watch-track.mjs`.

The LLM **analyzes**; gates **decide what is legal**.

---

## What to add (new files / behavior)

| # | Item | Description |
|---|------|-------------|
| 1 | **`server/xau-local-agent.mjs`** | Build prompt packet, call Ollama, parse JSON, apply gates, call eval + ntfy |
| 2 | **`server/xau-local-agent-prompt.md`** (or embed) | Short system prompt + event-specific user templates |
| 3 | **`server/xau-context-packet.mjs`** | Trim `context.json` + last N bars into stable JSON for the model |
| 4 | **Hook in `xau-watch-loop.mjs`** | After `runXauTick`, if `XAU_LOCAL_AGENT=1`, run local agent |
| 5 | **`local-agent-decisions.jsonl`** (optional) | Raw LLM I/O audit beside `evaluations.jsonl` |
| 6 | **`run-agent-loop.sh`** | Default `XAU_CURSOR_WAKE=0`, `XAU_LOCAL_AGENT=1` for production profile |
| 7 | **Docs** | Point [XAU-AGENT-LOOP.md](./XAU-AGENT-LOOP.md) “production mode” here |

Optional Python equivalent: `tools/xau-scalp-agent/local_agent/` with same contract calling Ollama — only if you prefer Python; **one** implementation is enough.

---

## What to modify (small changes)

| File | Change |
|------|--------|
| `xau-watch-loop.mjs` | Call local agent; gate `emitAgentWake()` behind `XAU_CURSOR_WAKE=1` |
| `xau-ntfy-push.mjs` | Optional: accept decisions from local agent (or local agent calls `sendNtfy` directly with same `eventKey` dedupe) |
| `xau-log-evaluation.mjs` | Unchanged interface; local agent invokes with same JSON as Cursor did |
| `xau-agent-brief.mjs` | Optional: stop saying **ENTER candidate** unless local agent agreed; or brief remains log-only |
| `NTFY-PHONE-ALERTS.md` | Note: watch ntfy may wait for **`APPROVE_WATCH`** from local agent (if we suppress raw `newWatchIssued` ntfy) |

**Infrastructure unchanged:** bridge, extension, Pine, state dir, watch math, FOMC calendar fetch, retention.

---

## Flow after implementation

```text
run-agent-loop.sh (XAU_LOCAL_AGENT=1, XAU_CURSOR_WAKE=0, XAU_NTFY=1)
  → runXauTick()
  → xau-local-agent.run(ctx)
       → if event matches: packet + Ollama
       → gates.validate(decision)
       → appendEvaluation(...)  // same as xau-log-evaluation.mjs
       → sendNtfy(...)          // same titles/dedupe
  → (optional) append brief to brief.log
  → NO AGENT_LOOP_TICK_xau
```

Cursor: use manually for code changes, rule tuning, and reviewing `evaluations.jsonl` / journal — **not** wired to the loop.

---

## Rollout phases

### Phase 1 — Wire local agent (MVP)

- Ollama installed; model pulled.
- Local agent on **watch issued**, **watch revoked**, **new 5m bar**.
- Logs all decisions to **`evaluations.jsonl`**.
- **ntfy** only when LLM + gates say `notify: true`.
- Cursor monitoring **off**.

### Phase 2 — Tighten parity with Cursor

- Refine prompt from `AGENT-LOOP-PROMPT.md` § hard filters + scoring.
- Optional **`local-agent-decisions.jsonl`** for debugging.
- Suppress duplicate ntfy from loop if local agent is sole approver for watches.

### Phase 3 — Optional optimization

- Deterministic pre-score in Node; LLM only on **borderline** or message wording.
- GPU / 14B model for harder sessions.

---

## Prerequisites (operator)

1. Ollama on the loop machine (or LAN): `curl -fsSL https://ollama.com/install.sh | sh` && `ollama pull qwen2.5:7b-instruct`
2. Chrome bridge + 5m/15m tabs (unchanged).
3. ntfy + phone (unchanged).
4. Stop using **Cursor output monitoring** on `^AGENT_LOOP_TICK_xau` for production.

---

## Success criteria

- Same watch / stand-down / rare ENTER **semantics** as today when Cursor followed the protocol.
- **Zero** Cursor agent cost during live loop.
- Every **5m bar** (when archived) has a row in **`evaluations.jsonl`** without manual chat.
- No **prepare** ntfy when **`dataIntegrity.ok`** is false (gates + LLM).
- You can replay **`local-agent-decisions.jsonl`** / **`evaluations.jsonl`** to tune prompts without burning Cursor credits.

---

## Related files

| Doc | Role |
|-----|------|
| [AGENT-LOOP-PROMPT.md](./AGENT-LOOP-PROMPT.md) | Source of truth for decisions (LLM prompt derives from this) |
| [XAU-AGENT-LOOP.md](./XAU-AGENT-LOOP.md) | Run loop, ntfy, troubleshooting |
| [SIGNAL-RECOMMENDATIONS.md](./SIGNAL-RECOMMENDATIONS.md) | When to trade; connect agent (update for local LLM) |
| [NTFY-PHONE-ALERTS.md](./NTFY-PHONE-ALERTS.md) | Phone alert types |

When implementation starts, say **go implement Phase 1** and work from this document in order.
