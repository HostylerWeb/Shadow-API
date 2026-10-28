#!/usr/bin/env node
/**
 * YouTube live chat watcher via Chrome Agent Bridge.
 *
 * Default CHAT_REPLY_MODE=cursor: scans chat, queues a job for the Cursor agent (you).
 * The agent reads the job over MCP/HTTP, analyzes, and sends via chrome_send_youtube_reply.
 *
 * CHAT_REPLY_MODE=api: calls CHAT_AI_API_KEY directly (no Cursor session required).
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { connectMcpClient, requestExtension } from "./bridge.js";
import { initReplyMemory, getAgentContextBrief } from "./reply-memory.js";
import { enqueueJob, readQueue } from "./chat-queue.js";
import { isAiReplyEnabled, analyzeAndReply } from "./chat-ai.js";
import {
  checkContradiction,
  recordReply,
  wasReplyUsedRecently,
} from "./reply-memory.js";

let bridgeClientReady = false;

async function ensureBridgeClient() {
  if (bridgeClientReady) {
    try {
      await requestExtension("ping", {}, 3000);
      return;
    } catch {
      bridgeClientReady = false;
    }
  }
  await connectMcpClient();
  bridgeClientReady = true;
}

const REPLY_MODE = (process.env.CHAT_REPLY_MODE || "cursor").toLowerCase();
const INTERVAL_MS = Number(process.env.CHAT_WATCH_MS ?? 10000);
const MIN_REPLY_GAP_MS = Number(process.env.CHAT_REPLY_GAP_MS ?? 25000);
const DUPLICATE_REPLY_MS = Number(process.env.CHAT_DUPLICATE_REPLY_MS ?? 300000);
let sendInFlight = false;
const STATE_PATH = process.env.CHAT_STATE_PATH ?? "/tmp/ytchat-agent-state.json";
const STATUS_PATH = process.env.CHAT_STATUS_PATH ?? "/tmp/ytchat-agent-status.json";
const MAX_REPLY_LEN = 200;
const OWN_AUTHOR_RE = /alexh-u8s|alexdumpster/i;

function clampReply(text) {
  const t = String(text)
    .replace(/\s*[—–]\s*/g, ". ")
    .replace(/\s+/g, " ")
    .replace(/\. \./g, ".")
    .trim();
  if (t.length <= MAX_REPLY_LEN) return t;
  return `${t.slice(0, MAX_REPLY_LEN - 1)}…`;
}

function rememberReply(state, reply) {
  if (!state.recentReplyTexts) state.recentReplyTexts = [];
  if (!state.recentReplyTexts.includes(reply)) state.recentReplyTexts.push(reply);
  if (state.recentReplyTexts.length > 20) state.recentReplyTexts = state.recentReplyTexts.slice(-20);
}

export function loadState() {
  if (!existsSync(STATE_PATH)) return { seen: {}, answered: {}, lastReplyAt: 0 };
  try {
    const s = JSON.parse(readFileSync(STATE_PATH, "utf8"));
    if (!s.answered) s.answered = {};
    if (!s.recentReplyTexts) s.recentReplyTexts = [];
    return s;
  } catch {
    return { seen: {}, answered: {}, lastReplyAt: 0 };
  }
}

export function saveState(state) {
  writeFileSync(STATE_PATH, JSON.stringify(state));
}

function writeStatus(patch) {
  let base = {};
  if (existsSync(STATUS_PATH)) {
    try {
      base = JSON.parse(readFileSync(STATUS_PATH, "utf8"));
    } catch {
      base = {};
    }
  }
  writeFileSync(STATUS_PATH, JSON.stringify({ ...base, ...patch, updatedAt: Date.now() }));
}

function msgKey(m) {
  return `${m.author || "?"}::${(m.text || "").slice(0, 300)}`;
}

function cleanText(t) {
  return String(t || "")
    .replace(/\u200b/g, "")
    .replace(/@[\w.-]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isOwnMessage(m) {
  return OWN_AUTHOR_RE.test(m.author || "") || OWN_AUTHOR_RE.test(m.text || "");
}

function collectNewCandidates(messages, state) {
  const out = [];
  for (const m of messages) {
    const key = msgKey(m);
    if (isOwnMessage(m)) continue;
    if (state.answered?.[key]) continue;
    if (state.seen?.[key]) continue;
    const body = cleanText(m.text);
    if (body.length < 8) continue;
    out.push({ id: key, key, author: m.author || "?", text: body, raw: m });
  }
  return out.slice(-6);
}

function hasUnprocessed(messages, state) {
  return collectNewCandidates(messages, state).length > 0;
}

export function applyAgentCompletion({
  messageKeys = [],
  reply = null,
  posted = false,
  skipped = false,
  skipReason = null,
} = {}) {
  const state = loadState();
  const now = Date.now();
  if (!state.answered) state.answered = {};
  for (const key of messageKeys) {
    state.seen[key] = now;
    state.answered[key] = now;
  }
  if (skipped) {
    saveState(state);
    writeStatus({ lastAgentSkip: skipReason, replied: false });
    return;
  }
  if (reply) {
    state.lastReplyAt = now;
    state.lastReplyText = reply;
    if (messageKeys[0]) state.lastReplyKey = messageKeys[0];
    rememberReply(state, reply);
    recordReply({
      source: "agent",
      ruleId: "cursor_agent",
      triggerText: messageKeys.length ? String(messageKeys[0]) : null,
      replyText: reply,
      posted,
    });
  }
  saveState(state);
  writeStatus({ replied: Boolean(reply), lastReply: reply, posted });
}

async function getYoutubeTab() {
  const tabs = await requestExtension("tabs.list");
  const live = tabs.filter((t) => /youtube\.com\/(live|watch)/i.test(t.url || ""));
  if (live.length) return live.find((t) => t.active) || live[0];
  const anyYt = tabs.filter((t) => /youtube\.com/i.test(t.url || ""));
  return anyYt.find((t) => t.active) || anyYt[0] || null;
}

async function ensureExtension({ embedded }) {
  if (!embedded) await ensureBridgeClient();
  await requestExtension("ping", {}, 5000).catch(() => {
    bridgeClientReady = false;
    throw new Error("Extension not connected");
  });
}

async function sendReplyDirect(yt, reply, meta, state, fp, now) {
  sendInFlight = true;
  let out;
  try {
    out = await requestExtension(
      "page.command",
      { tabId: yt.id, command: "fillReply", args: { text: reply, submit: true } },
      35000,
    );
  } finally {
    sendInFlight = false;
  }
  const { key, body, ruleId, author } = meta;
  state.lastReplyAt = now;
  state.lastReplyKey = key;
  state.lastReplyText = reply;
  state.lastReplyTarget = body;
  rememberReply(state, reply);
  recordReply({
    source: "watcher",
    videoUrl: yt.url,
    ruleId,
    triggerAuthor: author,
    triggerText: body,
    replyText: reply,
    posted: out?.posted === true,
  });
  saveState(state);
  return out;
}

async function tickApiMode(state, { embedded }, messages, yt, now, fp) {
  const candidates = collectNewCandidates(messages, state);
  if (!candidates.length) return;
  if (!isAiReplyEnabled()) {
    writeStatus({ ok: false, error: "CHAT_AI_API_KEY not set", replyMode: "api" });
    return;
  }
  const result = await analyzeAndReply({
    transcriptMessages: messages,
    newCandidates: candidates,
    ownAuthorRe: OWN_AUTHOR_RE,
  });
  if (!result.ok || !result.should_reply || !result.reply) {
    for (const c of candidates) state.seen[c.key] = now;
    saveState(state);
    writeStatus({ aiSkip: result.skip_reason, replied: false, replyMode: "api" });
    return;
  }
  const chosen = candidates.find((c) => c.id === result.chosenId) || candidates[candidates.length - 1];
  let reply = clampReply(result.reply);
  if (checkContradiction(reply).ok === false || wasReplyUsedRecently(reply, DUPLICATE_REPLY_MS)) {
    state.answered[chosen.key] = now;
    state.seen[chosen.key] = now;
    saveState(state);
    return;
  }
  state.seen[chosen.key] = now;
  state.answered[chosen.key] = now;
  const out = await sendReplyDirect(
    yt,
    reply,
    { key: chosen.key, body: chosen.text, ruleId: result.topic || "ai", author: chosen.author },
    state,
    fp,
    now,
  );
  writeStatus({ replied: true, lastReply: reply, posted: out?.posted === true, replyMode: "api" });
}

async function tickCursorMode(state, { embedded }, messages, yt, now) {
  const candidates = collectNewCandidates(messages, state);
  if (!candidates.length) return;

  const existing = readQueue();
  if (existing?.status === "pending" || existing?.status === "processing") {
    writeStatus({ queued: true, queueStatus: existing.status, replyMode: "cursor" });
    return;
  }

  const enqueued = enqueueJob({
    tabId: yt.id,
    videoUrl: yt.url,
    transcript: messages.slice(-45),
    candidates,
    memoryBrief: getAgentContextBrief({ replyLimit: 12 }),
    instructions:
      "Read transcript and candidates. If a reply is warranted, send ONE short human line via chrome_send_youtube_reply (tabId from job). Then chrome_youtube_chat_complete. If skip, complete with skipped=true.",
  });

  if (!enqueued) {
    writeStatus({ queued: true, queueStatus: "processing", replyMode: "cursor" });
    return;
  }

  for (const c of candidates) {
    state.seen[c.key] = now;
  }
  saveState(state);

  console.error(`[chat-watch] queued job for Cursor agent (${candidates.length} new line(s))`);
  writeStatus({
    ok: true,
    needsCursorAgent: true,
    queued: true,
    queueStatus: "pending",
    candidateCount: candidates.length,
    replyMode: "cursor",
    youtubeTabId: yt.id,
  });
}

async function tick(state, { embedded }) {
  if (sendInFlight) return;
  await ensureExtension({ embedded });

  const yt = await getYoutubeTab();
  if (!yt?.id) {
    writeStatus({ ok: true, error: "no_youtube_tab", extension: true, replied: false, replyMode: REPLY_MODE });
    return;
  }

  const chat = await requestExtension(
    "page.command",
    { tabId: yt.id, command: "extractLiveChat", args: {} },
    20000,
  );
  const messages = chat.liveChat || [];
  const now = Date.now();
  const fp = messages.map((m) => msgKey(m)).join("|");

  if (!messages.length) {
    writeStatus({ ok: true, messageCount: 0, replied: false, replyMode: REPLY_MODE });
    return;
  }

  if (!hasUnprocessed(messages, state)) {
    console.error(`[chat-watch] heartbeat: ${messages.length} msgs, nothing new`);
    writeStatus({ ok: true, messageCount: messages.length, nothingNew: true, replyMode: REPLY_MODE });
    return;
  }

  if (now - state.lastReplyAt < MIN_REPLY_GAP_MS) {
    const gap = Math.ceil((MIN_REPLY_GAP_MS - (now - state.lastReplyAt)) / 1000);
    writeStatus({ cooldownSec: gap, messageCount: messages.length, replyMode: REPLY_MODE });
    return;
  }

  if (REPLY_MODE === "api") {
    await tickApiMode(state, { embedded }, messages, yt, now, fp);
    return;
  }

  await tickCursorMode(state, { embedded }, messages, yt, now);
}

export async function runChatWatch({ embedded = false } = {}) {
  console.error(
    `[chat-watch] embedded=${embedded}, every ${INTERVAL_MS}ms, replyMode=${REPLY_MODE}` +
      (REPLY_MODE === "cursor" ? " (Cursor agent analyzes + sends via MCP)" : " (direct API)"),
  );
  writeStatus({ running: true, embedded, intervalMs: INTERVAL_MS, replyMode: REPLY_MODE });
  initReplyMemory();
  const state = loadState();

  for (;;) {
    try {
      await tick(state, { embedded });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[chat-watch]", msg);
      writeStatus({ ok: false, error: msg });
    }
    await new Promise((r) => setTimeout(r, INTERVAL_MS));
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) void runChatWatch({ embedded: false });
