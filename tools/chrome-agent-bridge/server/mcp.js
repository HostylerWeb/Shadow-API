#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { ensureBridgeReady, extensionConnected, requestExtension } from "./bridge.js";
import { readActiveQueue, markProcessing, completeJob, getQueuePath } from "./chat-queue.js";
import { applyAgentCompletion } from "./chat-watch.js";
import {
  addBannedPhrase,
  checkReplyDraft,
  getAgentContextBrief,
  getMemoryDbPath,
  getRecentReplies,
  getWhatYouSaidBrief,
  initReplyMemory,
  ingestOwnTranscriptLines,
  recordReply,
} from "./reply-memory.js";

initReplyMemory();

const PORT = Number(process.env.CHROME_BRIDGE_PORT ?? 17321);

await ensureBridgeReady();

const server = new Server(
  { name: "chrome-agent-bridge", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "chrome_bridge_status",
      description: "Check whether the Chrome extension is connected to the local bridge.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "chrome_list_tabs",
      description: "List open browser tabs (id, url, title).",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "chrome_active_page_snapshot",
      description: "Get URL, title, and main text from the active tab.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "chrome_tab_snapshot",
      description: "Snapshot a tab by id (from chrome_list_tabs). Use when the user names a background tab.",
      inputSchema: {
        type: "object",
        properties: { tabId: { type: "number", description: "Chrome tab id" } },
        required: ["tabId"],
      },
    },
    {
      name: "chrome_tradingview_chart",
      description:
        "TradingView tab snapshot: chart container + legend rows + OHLC (for XAU loop). Requires tradingview.com tab.",
      inputSchema: {
        type: "object",
        properties: {
          tabId: { type: "number", description: "TradingView tab id; omit for active tab" },
        },
      },
    },
    {
      name: "chrome_extract_comments",
      description: "Heuristic extract of comment-like blocks on the active tab.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "chrome_fill_reply",
      description: "Fill the reply/comment box on the active tab (does not click Post).",
      inputSchema: {
        type: "object",
        properties: { text: { type: "string", description: "Reply text to insert" } },
        required: ["text"],
      },
    },
    {
      name: "chrome_reply_memory_context",
      description:
        "Recent YouTube chat replies and standing positions so you do not repeat lines or contradict yourself.",
      inputSchema: {
        type: "object",
        properties: {
          replyLimit: { type: "number", description: "How many recent replies (default 12)" },
        },
      },
    },
    {
      name: "chrome_reply_memory_check",
      description:
        "Check draft reply against WHAT YOU SAID memory: duplicates, near-repeats, banned bot templates, contradictions.",
      inputSchema: {
        type: "object",
        properties: {
          text: { type: "string", description: "Draft reply before sending" },
          ownTranscriptLines: {
            type: "array",
            items: { type: "string" },
            description: "Optional: your recent lines from the live transcript",
          },
        },
        required: ["text"],
      },
    },
    {
      name: "chrome_reply_memory_ban_phrase",
      description: "Ban a phrase template so it is never sent again (sounds too AI / overused).",
      inputSchema: {
        type: "object",
        properties: {
          phrase: { type: "string" },
          reason: { type: "string" },
        },
        required: ["phrase"],
      },
    },
    {
      name: "chrome_reply_memory_record",
      description: "Log a reply you sent (manual or off-bridge) into the local memory database.",
      inputSchema: {
        type: "object",
        properties: {
          text: { type: "string", description: "Exact reply text posted" },
          ruleId: { type: "string", description: "Optional topic tag, e.g. bot_accusation" },
          triggerText: { type: "string", description: "What they said, if known" },
          posted: { type: "boolean", description: "Whether it actually appeared in chat" },
        },
        required: ["text"],
      },
    },
    {
      name: "chrome_youtube_chat_job",
      description:
        "Pending YouTube live chat job from the bridge watcher: transcript, new lines, tabId. You analyze and decide reply vs skip.",
      inputSchema: { type: "object", properties: { claim: { type: "boolean", description: "Set true to mark processing" } } },
    },
    {
      name: "chrome_youtube_chat_complete",
      description: "Mark the current chat job done after you replied or skipped; updates watcher state.",
      inputSchema: {
        type: "object",
        properties: {
          messageKeys: { type: "array", items: { type: "string" } },
          reply: { type: "string" },
          posted: { type: "boolean" },
          skipped: { type: "boolean" },
          skipReason: { type: "string" },
        },
      },
    },
    {
      name: "chrome_send_youtube_reply",
      description:
        "Type and send a reply on a YouTube tab (background ok). Records memory; warns on duplicate/contradiction unless force=true.",
      inputSchema: {
        type: "object",
        properties: {
          text: { type: "string", description: "Reply to post" },
          tabId: { type: "number", description: "YouTube tab id; omit to use first watch/live tab" },
          ruleId: { type: "string" },
          triggerText: { type: "string" },
          force: { type: "boolean", description: "Send even if duplicate or contradictory check fails" },
        },
        required: ["text"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;
  try {
    let result;
    switch (name) {
      case "chrome_bridge_status": {
        let extensionOk = false;
        try {
          await requestExtension("ping", {}, 3000);
          extensionOk = true;
        } catch {
          extensionOk = false;
        }
        result = {
          hubConnected: extensionConnected(),
          extensionConnected: extensionOk,
          bridgeUrl: `ws://127.0.0.1:${PORT}/extension`,
        };
        break;
      }
      case "chrome_list_tabs":
        result = await requestExtension("tabs.list");
        break;
      case "chrome_active_page_snapshot":
        result = await requestExtension("activeTab.command", { command: "snapshot", args: {} });
        break;
      case "chrome_tab_snapshot":
        result = await requestExtension("page.command", {
          tabId: Number(args?.tabId),
          command: "snapshot",
          args: {},
        });
        break;
      case "chrome_tradingview_chart": {
        const tabId = Number(args?.tabId);
        if (tabId) {
          result = await requestExtension("page.command", {
            tabId,
            command: "tradingviewChart",
            args: {},
          });
        } else {
          result = await requestExtension("activeTab.command", {
            command: "tradingviewChart",
            args: {},
          });
        }
        break;
      }
      case "chrome_extract_comments":
        result = await requestExtension("activeTab.command", { command: "extractComments", args: {} });
        break;
      case "chrome_fill_reply":
        result = await requestExtension("activeTab.command", {
          command: "fillReply",
          args: { text: String(args?.text ?? "") },
        });
        break;
      case "chrome_reply_memory_context":
        result = {
          dbPath: getMemoryDbPath(),
          whatYouSaid: getWhatYouSaidBrief({ limit: Number(args?.replyLimit) || 20 }),
          brief: getAgentContextBrief({ replyLimit: Number(args?.replyLimit) || 12 }),
          recent: getRecentReplies(Number(args?.replyLimit) || 12),
        };
        break;
      case "chrome_reply_memory_check":
        result = checkReplyDraft(String(args?.text ?? ""), {
          ownLinesInTranscript: Array.isArray(args?.ownTranscriptLines)
            ? args.ownTranscriptLines.map(String)
            : [],
        });
        break;
      case "chrome_reply_memory_ban_phrase":
        result = addBannedPhrase(String(args?.phrase ?? ""), args?.reason ? String(args.reason) : undefined);
        break;
      case "chrome_youtube_chat_job": {
        if (args?.claim) markProcessing();
        result = { queuePath: getQueuePath(), job: readActiveQueue() };
        break;
      }
      case "chrome_youtube_chat_complete":
        applyAgentCompletion({
          messageKeys: Array.isArray(args?.messageKeys) ? args.messageKeys.map(String) : [],
          reply: args?.reply ? String(args.reply) : null,
          posted: Boolean(args?.posted),
          skipped: Boolean(args.skipped),
          skipReason: args?.skipReason ? String(args.skipReason) : null,
        });
        completeJob({ reply: args?.reply, posted: args?.posted, error: args?.skipReason });
        result = { ok: true };
        break;
      case "chrome_reply_memory_record":
        result = recordReply({
          source: "agent",
          ruleId: args?.ruleId ? String(args.ruleId) : null,
          triggerText: args?.triggerText ? String(args.triggerText) : null,
          replyText: String(args?.text ?? ""),
          posted: Boolean(args?.posted),
        });
        break;
      case "chrome_send_youtube_reply": {
        const text = String(args?.text ?? "").trim();
        const force = Boolean(args?.force);
        const warnings = [];
        if (!force) {
          const check = checkReplyDraft(text);
          if (!check.ok) warnings.push(...check.warnings);
        }
        let tabId = Number(args?.tabId);
        if (!tabId) {
          const tabs = await requestExtension("tabs.list");
          const yt =
            tabs.find((t) => /youtube\.com\/(live|watch)/i.test(t.url || "")) ||
            tabs.find((t) => /youtube\.com/i.test(t.url || ""));
          tabId = yt?.id;
        }
        if (!tabId) throw new Error("No YouTube tab found");
        const sendResult = await requestExtension(
          "page.command",
          { tabId, command: "fillReply", args: { text, submit: true } },
          35000,
        );
        recordReply({
          source: "agent",
          videoUrl: null,
          ruleId: args?.ruleId ? String(args.ruleId) : null,
          triggerText: args?.triggerText ? String(args.triggerText) : null,
          replyText: text,
          posted: sendResult?.posted === true,
        });
        result = { tabId, warnings, send: sendResult };
        break;
      }
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { content: [{ type: "text", text: JSON.stringify({ error: message }) }], isError: true };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
