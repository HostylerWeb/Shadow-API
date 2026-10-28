#!/usr/bin/env node
/**
 * One agent turn: read queued job, compose via LLM (no canned lines), post or skip.
 * Without CHAT_AI_API_KEY / OPENAI_API_KEY this exits without posting (Cursor agent composes in chat).
 */
import { connectMcpClient, requestExtension } from "./bridge.js";
import { analyzeAndReply, isAiReplyEnabled } from "./chat-ai.js";
import {
  checkContradiction,
  isTooSimilarToAny,
  isTooSimilarToRecent,
  recordReply,
  sanitizeReplyText,
  wasReplyUsedRecently,
} from "./reply-memory.js";

const OWN_AUTHOR_RE = /alexh-u8s|alexdumpster/i;

function ownRecentLines(transcript) {
  return (transcript || [])
    .filter((m) => OWN_AUTHOR_RE.test(m.author || "") || OWN_AUTHOR_RE.test(m.text || ""))
    .map((m) => String(m.text || "").replace(/@\S+/g, "").trim())
    .filter((t) => t.length > 10)
    .slice(-8);
}

async function complete(job, payload) {
  await fetch("http://127.0.0.1:17320/chat/agent-complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

async function main() {
  const jobRes = await fetch("http://127.0.0.1:17320/chat/agent-job");
  const { job } = await jobRes.json();
  if (!job?.candidates?.length) return;

  const keys = job.candidates.map((c) => c.key);
  await fetch("http://127.0.0.1:17320/chat/agent-claim", { method: "POST" });

  if (!isAiReplyEnabled()) {
    // Cursor-agent mode: never post hardcoded text from this script.
    return;
  }

  const yours = ownRecentLines(job.transcript);
  let result = await analyzeAndReply({
    transcriptMessages: job.transcript || [],
    newCandidates: job.candidates,
    ownAuthorRe: OWN_AUTHOR_RE,
    extraContext: yours.length
      ? `Lines YOU (Alex) already posted in this chat — do not repeat or paraphrase:\n${yours.map((l) => `- ${l}`).join("\n")}`
      : "",
  });

  if (!result.ok || !result.should_reply || !result.reply) {
    await complete(job, {
      skipped: true,
      skipReason: result.skip_reason || result.error || "no_reply",
      messageKeys: keys,
    });
    return;
  }

  let reply = sanitizeReplyText(result.reply);
  if (!reply || reply.length < 8 || reply.length > 200) {
    await complete(job, { skipped: true, skipReason: "bad_length", messageKeys: keys });
    return;
  }

  if (
    wasReplyUsedRecently(reply) ||
    isTooSimilarToRecent(reply) ||
    isTooSimilarToAny(reply, yours, 0.45)
  ) {
    result = await analyzeAndReply({
      transcriptMessages: job.transcript || [],
      newCandidates: job.candidates,
      ownAuthorRe: OWN_AUTHOR_RE,
      extraContext: "Your last draft was too similar to something you already said. Skip OR write a totally different line.",
    });
    if (!result.should_reply || !result.reply) {
      await complete(job, { skipped: true, skipReason: "would_repeat", messageKeys: keys });
      return;
    }
    reply = sanitizeReplyText(result.reply);
  }

  const contradiction = checkContradiction(reply);
  if (!contradiction.ok || !reply) {
    await complete(job, { skipped: true, skipReason: "contradiction", messageKeys: keys });
    return;
  }

  await connectMcpClient();
  const out = await requestExtension(
    "page.command",
    { tabId: job.tabId, command: "fillReply", args: { text: reply, submit: true } },
    35000,
  );
  recordReply({
    source: "agent",
    ruleId: result.topic || "composed",
    triggerText: job.candidates.find((c) => c.id === result.chosenId)?.text,
    replyText: reply,
    posted: out?.posted === true,
  });
  await complete(job, { messageKeys: keys, reply, posted: out?.posted === true });
  if (out?.posted) console.log("posted");
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
