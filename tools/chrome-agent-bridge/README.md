# Chrome Agent Bridge

Chrome extension + local MCP server. **No Chrome remote debugging port.**

**How it works (architecture + flow):** [HOW-IT-WORKS.md](./HOW-IT-WORKS.md).

**YouTube live chat (default):** bridge scans chat (`CHAT_REPLY_MODE=cursor`), queues a job; **Cursor agent** reads it via MCP (`chrome_youtube_chat_job`), analyzes, sends (`chrome_send_youtube_reply`). See `server/AGENT-LOOP-PROMPT.md`. Optional `CHAT_REPLY_MODE=api` + `CHAT_AI_API_KEY` for no Cursor session.

**Reply memory (no repeats / no contradictions):** [CHAT-MEMORY.md](./CHAT-MEMORY.md).

## Install the extension

1. Open Chrome → `chrome://extensions`
2. Enable **Developer mode**
3. **Load unpacked** → select folder:
   `tools/chrome-agent-bridge/extension`
4. Pin the extension; popup should show **Connected** after step 2 below.

## Run the MCP bridge

```bash
cd tools/chrome-agent-bridge/server
npm install
node mcp.js
```

Leave this running, or configure Cursor to start it (see below).

## Cursor MCP config

Add to Cursor **Settings → MCP** (or `.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "chrome-agent": {
      "command": "node",
      "args": ["/var/www/ShadowAPI/tools/chrome-agent-bridge/server/mcp.js"]
    }
  }
}
```

Use the full path on your machine.

## Tools

- `chrome_bridge_status`
- `chrome_list_tabs`
- `chrome_active_page_snapshot`
- `chrome_extract_comments`
- `chrome_fill_reply` (fills box only; you still click Post)

## Notes

- Bridge listens on `127.0.0.1:17321` only.
- Comment detection is generic; site-specific selectors can be added in `content.js`.
- Reload the tab after installing the extension so the content script injects.
