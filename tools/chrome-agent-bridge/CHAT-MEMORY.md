# What you said (reply memory)

SQLite log of **every reply Alex posts** in YouTube live chat so the agent does not repeat itself or contradict earlier posts.

## Database file

`~/.local/state/chrome-agent/reply-memory.sqlite`

Override: `CHAT_MEMORY_DB=/path/to/file.sqlite`

## Tables

| Table | Purpose |
|-------|---------|
| `replies` | Timestamp, source (`agent`, `watcher`, `transcript`, `import`), trigger, exact reply text, posted flag |
| `stances` | Standing positions by topic (stay consistent) |
| `banned_phrases` | Templates that must never be sent again (e.g. “the painter is Hitler” lecture lines) |

On first run, recent lines from `/tmp/ytchat-agent-state.json` are imported if the DB was empty.

Each agent job fetch also **syncs your own lines from the live transcript** into `replies` so manual sends are remembered.

## Before you draft

- MCP: `chrome_reply_memory_context` → `whatYouSaid` block
- HTTP: `GET http://127.0.0.1:17320/chat/memory`
- Agent job: `GET http://127.0.0.1:17320/chat/agent-job` includes `memory.whatYouSaid`

## Before you send

- MCP: `chrome_reply_memory_check` with draft `text` (+ optional `ownTranscriptLines`)
- `chrome_send_youtube_reply` runs the same checks unless `force: true`

## After you send

- `chrome_send_youtube_reply` and `chrome_reply_memory_record` log the line
- `chrome_youtube_chat_complete` with `reply` logs via watcher state

## CLI

```bash
node server/reply-memory-cli.js list
node server/reply-memory-cli.js what-you-said
node server/reply-memory-cli.js check "your draft reply here"
node server/reply-memory-cli.js ban "phrase to never use again"
```

## Ban a bot-sounding template

```bash
node server/reply-memory-cli.js ban "the painter is hitler"
```

Or MCP: `chrome_reply_memory_ban_phrase`.
