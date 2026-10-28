import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  getAgentContextBrief,
  isTooSimilarToRecent,
  sanitizeReplyText,
  wasReplyUsedRecently,
} from "./reply-memory.js";

const __dir = dirname(fileURLToPath(import.meta.url));

const DEFAULT_GUIDELINES = join(__dir, "chat-voice.md");
const GUIDELINES_PATH = process.env.CHAT_AI_GUIDELINES || DEFAULT_GUIDELINES;

function loadGuidelines() {
  if (!existsSync(GUIDELINES_PATH)) {
    throw new Error(`Missing guidelines file: ${GUIDELINES_PATH}`);
  }
  return readFileSync(GUIDELINES_PATH, "utf8");
}

function apiConfig() {
  const key = process.env.CHAT_AI_API_KEY || process.env.OPENAI_API_KEY;
  const base = (process.env.CHAT_AI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const model = process.env.CHAT_AI_MODEL || "gpt-4o-mini";
  return { key, url: `${base}/chat/completions`, model };
}

function formatTranscript(messages, ownAuthorRe) {
  const lines = [];
  for (const m of messages.slice(-40)) {
    const author = String(m.author || "?").replace(/\s+/g, " ");
    const text = String(m.text || "").replace(/\s+/g, " ").trim();
    if (!text) continue;
    const tag = ownAuthorRe?.test(author) || ownAuthorRe?.test(text) ? " [YOU]" : "";
    lines.push(`${author}${tag}: ${text}`);
  }
  return lines.join("\n");
}

function parseJsonObject(raw) {
  const s = String(raw || "").trim();
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("Model did not return JSON");
  return JSON.parse(s.slice(start, end + 1));
}

/**
 * Read chat + new lines; model decides skip vs contextual reply (no canned lines).
 */
export async function analyzeAndReply({
  transcriptMessages,
  newCandidates,
  ownAuthorRe,
  extraContext = "",
}) {
  const { key, url, model } = apiConfig();
  if (!key) {
    return {
      ok: false,
      error: "CHAT_AI_API_KEY or OPENAI_API_KEY not set",
      should_reply: false,
    };
  }

  const guidelines = loadGuidelines();
  const memoryBrief = getAgentContextBrief({ replyLimit: 15, stanceLimit: 8 });

  const candidateBlock = newCandidates
    .map((c, i) => `${i + 1}. id=${c.id} | ${c.author}: ${c.text}`)
    .join("\n");

  const userContent = `## Recent replies (do not repeat)
${memoryBrief}

## Live chat transcript (newest at bottom)
${formatTranscript(transcriptMessages, ownAuthorRe)}

## New message(s) not yet handled — pick at most ONE to answer (highest priority)
${candidateBlock}

${extraContext ? `## Note\n${extraContext}\n` : ""}
Evaluate the new message(s). Reply only if engagement is warranted. JSON only.`;

  const body = {
    model,
    temperature: 0.82,
    max_tokens: 280,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: guidelines },
      { role: "user", content: userContent },
    ],
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.message || res.statusText || "chat completion failed";
    return { ok: false, error: msg, should_reply: false };
  }

  const content = data.choices?.[0]?.message?.content;
  let parsed;
  try {
    parsed = parseJsonObject(content);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e), should_reply: false };
  }

  const should = Boolean(parsed.should_reply);
  let reply = should ? sanitizeReplyText(String(parsed.reply || "")) : null;
  if (reply && (wasReplyUsedRecently(reply) || isTooSimilarToRecent(reply))) {
    return {
      ok: true,
      should_reply: false,
      reply: null,
      skip_reason: "too_similar_to_recent",
      topic: parsed.topic ? String(parsed.topic) : null,
      chosenId: null,
      model,
    };
  }

  let chosenId = null;
  if (should && parsed.message_index != null) {
    const idx = Number(parsed.message_index) - 1;
    if (idx >= 0 && idx < newCandidates.length) chosenId = newCandidates[idx].id;
  }
  if (should && !chosenId && newCandidates.length === 1) chosenId = newCandidates[0].id;

  return {
    ok: true,
    should_reply: should && reply && reply.length >= 8,
    reply: should && reply ? reply : null,
    topic: parsed.topic ? String(parsed.topic) : null,
    skip_reason: parsed.skip_reason ? String(parsed.skip_reason) : null,
    chosenId,
    model,
  };
}

export function isAiReplyEnabled() {
  return Boolean(process.env.CHAT_AI_API_KEY || process.env.OPENAI_API_KEY);
}
