# Cursor agent tick (YouTube live chat)

1. `chrome_youtube_chat_job` with `claim: true` (or GET http://127.0.0.1:17320/chat/agent-job)
2. If no pending job, stop (no chat message to user).
3. Read transcript + candidates + **`chrome_reply_memory_context`** (focus on `whatYouSaid`) or job `memory.whatYouSaid` from HTTP.
4. **Compose fresh** — react to their line; do not repeat anything in WHAT YOU SAID or your own transcript lines.
5. Run **`chrome_reply_memory_check`** on the draft; if not `ok`, skip or rewrite completely different wording.
6. If skip: `chrome_youtube_chat_complete` with `skipped: true` and `messageKeys`.
7. If reply: `chrome_send_youtube_reply` then complete with `reply`, `posted`, `messageKeys`.

Do **not** use fixed templates or explain dogwhistles like a textbook. Do **not** post the same idea twice with the same sentences. Humans vary; bots repeat.

Do **not** run `agent-tick-once.js` for copy-paste lines unless `CHAT_AI_API_KEY` is set for composed replies only.
