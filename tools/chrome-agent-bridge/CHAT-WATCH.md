# YouTube live chat auto-watch

Autonomous scanner that reads **YouTube live chat** on your **active** tab and posts short replies through the Chrome extension. It does **not** switch or focus tabs.

## Architecture

```
┌─────────────────────┐     WebSocket      ┌──────────────────┐
│ chrome-agent-bridge │◄──── /extension ────│ Chrome extension │
│ (bridge.js)         │                     │ (background.js)  │
│                     │                     └────────┬─────────┘
│  CHAT_WATCH=1       │                              │ executeScript
│  └─ chat-watch.js   │                              ▼
└─────────────────────┘                     live_chat iframe + debugger send
```

| Piece | Path | Role |
|--------|------|------|
| Bridge + hub | `server/bridge.js` | WebSocket on `127.0.0.1:17321` (`/extension`, `/mcp`); health on `17320` |
| Watcher | `server/chat-watch.js` | 10s scan loop; rules + replies; state files |
| Extension | `extension/` | Connects to bridge; `extractLiveChat`, `fillReply` with debugger typing |
| Desktop copy | `~/Desktop/Chrome-Agent-Bridge` | Unpacked load path many users use — **sync** after extension changes |

When `CHAT_WATCH=1`, `bridge.js` imports and runs `runChatWatch({ embedded: true })` in the **same process** as the hub (one persistent extension socket).

## Running it (production setup)

User systemd unit (typical):

- `~/.config/systemd/user/chrome-agent-bridge.service`
- `Environment=CHAT_WATCH=1`, `CHAT_WATCH_MS=10000`, `CHAT_REPLY_GAP_MS=25000`
- **Do not** run a second `chrome-agent-chat-watch.service` (duplicate loops).

```bash
systemctl --user status chrome-agent-bridge.service
curl -s http://127.0.0.1:17320/health   # extensionConnected should be true
journalctl --user -u chrome-agent-bridge.service -f
```

**You need:** Chrome running (can be behind other apps), extension **Connected**, a **YouTube live/watch tab open** (does not have to be the front tab — you can use Cursor while it watches).

## What triggers a reply

Logic lives in `server/chat-watch.js`.

1. **`getYoutubeTab`** — uses an open live/watch URL; prefers active YouTube if you are on it, else a **background** tab. Never `tabs.focus` or tab switching.
2. **Skip your own posts** — authors matching `OWN_AUTHOR_RE` (e.g. `AlexH-u8s`).
3. **`matchRelevantMessage(m)`** — must match a rule in `RELEVANCE_RULES` or `replyToDirect()`:
   - Someone **talking to you** (`@Alex`, “brainwashed Alex”, etc.)
   - **Anti-Israel** (Free Palestine, river-to-sea, illegitimate state smears)
   - **Anti-peace** (peace slogans used to bash Israel/leaders)
   - **Anti-democracy** (stolen/fake election, bribe smears on the vote)
   - **Terror** (Hamas/Hezbollah praise, intifada, death to Israel/Jews)
   - **Fake ideology** (genocide/apartheid smears, Rothschild/Balfour, Nazi bait, antisemitism)
   - **Leader smears** (Hague/ICC/war criminal tied to Israel/Bibi)

   **No generic fallback** — if nothing matches, no post.

4. **Nothing relevant** — if every line is seen/answered or benign, log `nothing relevant` and exit the tick.
5. **Re-check** — `state.answered` tracks lines we already replied to; relevant lines can still be processed if not yet `answered` (e.g. rules tightened later).
6. **Rate limit** — `MIN_REPLY_GAP_MS` (default 25s) between sends.
7. **Duplicate text** — same reply body within `DUPLICATE_REPLY_MS` (default 5m) is skipped unless the hostile line is new.

Election small talk (“who’s winning”, seat counts, jokes) is intentionally **ignored** unless it hits the categories above.

## Evidence-style replies

- `EVIDENCE` — fact hooks per category, with sub-buckets (Hague vs ICC vs war criminal, etc.).
- `pickFromBucket()` picks lines that match what they said; `pickVariant()` rotates wording from the message seed.
- `clampReply()` enforces ~200 characters for YouTube.

To add facts: edit the arrays under `EVIDENCE_REPLIES` or add variants in `replyToDirect()`.

## Tweaking rules

### Add or change a category

In `RELEVANCE_RULES`, each entry has:

```js
{
  id: "terror",           // logged as [terror] in journalctl
  test: (t) => /.../.test(t),  // t = cleaned lowercase body
  reply: (t, seed) => clampReply(pickVariant(EVIDENCE_REPLIES.terror, seed)),
}
```

- **`test`** — keep it specific; broad regex = spam.
- **`reply`** — use `clampReply()`; prefer `EVIDENCE_REPLIES` for maintainability.

### Direct mentions

Edit `isDirectToMe()` and `replyToDirect()` at the top of `chat-watch.js`.

### Own handle

```js
const OWN_AUTHOR_RE = /alexh-u8s|alexdumpster/i;
```

## Environment variables

| Variable | Default | Meaning |
|----------|---------|---------|
| `CHAT_WATCH` | off | Set `1` in bridge service to enable embedded watcher |
| `CHAT_WATCH_MS` | `10000` | Scan interval |
| `CHAT_REPLY_GAP_MS` | `25000` | Min time between posts |
| `CHAT_DUPLICATE_REPLY_MS` | `300000` | Suppress identical reply text |
| `CHAT_STATE_PATH` | `/tmp/ytchat-agent-state.json` | Seen / answered / last reply |
| `CHAT_STATUS_PATH` | `/tmp/ytchat-agent-status.json` | Last scan summary for debugging |

After editing `chat-watch.js`, restart the bridge:

```bash
systemctl --user restart chrome-agent-bridge.service
```

Extension changes require **Reload** on `chrome://extensions` (sync Desktop folder if that is what you load).

## State files

**`/tmp/ytchat-agent-state.json`**

- `seen` — message keys already processed (benign or hostile)
- `answered` — keys we already posted a reply for
- `lastReplyAt`, `lastReplyText`, `lastReplyKey`, `lastReplyTarget`

To force re-evaluation of old chat (e.g. after big rule changes), you can delete this file while the bridge is stopped — you may get a burst of replies to anything still in the 50-message window that now matches rules.

**`/tmp/ytchat-agent-status.json`** — last heartbeat fields (`messageCount`, `replied`, `lastRule`, `nothingNew`, etc.).

Message key format:

```text
{author}::{first 300 chars of raw text}
```

## Sending chat (extension)

`fillReply` with `submit: true` in `extension/background.js`:

1. Locates chat input in **live_chat** iframe (`locateChatTargets`, tab coordinates).
2. Debugger: click input, `insertText`, Enter, optional Send click.
3. `submitLiveChatFromFrame()` — DOM Enter + Send in iframe as backup.
4. **Does not** activate or focus the tab (user requirement).

Logs: `posted: true` means our post appeared in the last extracted chat buffer (heuristic).

## MCP vs watcher

- **MCP** (`mcp.js`) attaches to `/mcp` for Cursor tools — manual snapshots, tests.
- **Watcher** uses the hub’s direct extension socket when embedded — runs 24/7 without Cursor open.

## Logs to watch

```text
[chat-watch] heartbeat scan ok: 50 msgs, nothing relevant
[chat-watch] skip: no YouTube live tab open in Chrome
[chat-watch] reply [direct_to_me] -> ...
[chat-watch] send result {"posted":true,...}
```

## Common issues

| Symptom | Cause | Fix |
|---------|--------|-----|
| `nothing relevant` / no posts | Chat is benign or already seen | Expected; tighten rules only if needed |
| `no YouTube live tab` | No live/watch tab open | Open the stream in Chrome (can stay in background) |
| `Extension not connected` | Bridge down or extension unloaded | `systemctl --user restart chrome-agent-bridge`; reload extension |
| `0 msgs` | Chat iframe not loaded | Refresh live page; keep tab active |
| Text in box, no send | Enter/Send in iframe | Update extension (`background.js`), reload 0.1.23+ |
| Duplicate spam | Old state / loose rules | Raise specificity; check `DUPLICATE_REPLY_MS`; clear state if needed |

## Files to edit for common tweaks

| Goal | File |
|------|------|
| When to reply | `server/chat-watch.js` → `RELEVANCE_RULES`, `isDirectToMe` |
| What to say | `server/chat-watch.js` → `EVIDENCE_REPLIES`, `replyToDirect` |
| Scan timing / cooldown | systemd `Environment=` or `chat-watch.js` constants |
| Chat read / post mechanics | `extension/background.js` |
| Enable/disable auto-watch | `chrome-agent-bridge.service` → `CHAT_WATCH=1` |
