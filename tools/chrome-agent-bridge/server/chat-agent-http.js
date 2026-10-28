import { readActiveQueue, readQueue, markProcessing, completeJob } from "./chat-queue.js";
import { applyAgentCompletion, loadState } from "./chat-watch.js";
import {
  getAgentContextBrief,
  getMemoryDbPath,
  getWhatYouSaidBrief,
  ingestOwnTranscriptLines,
  initReplyMemory,
} from "./reply-memory.js";

const OWN_AUTHOR_RE = /alexh-u8s|alexdumpster/i;

initReplyMemory();

export function handleChatAgentHttp(req, res, url) {
  if (url === "/chat/agent-job" && req.method === "GET") {
    const job = readActiveQueue();
    if (job?.transcript?.length) {
      ingestOwnTranscriptLines(job.transcript, OWN_AUTHOR_RE, { videoUrl: job.videoUrl || null });
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify(
        {
          job,
          memory: {
            dbPath: getMemoryDbPath(),
            whatYouSaid: getWhatYouSaidBrief({ limit: 20 }),
            brief: getAgentContextBrief({ replyLimit: 15 }),
          },
          state: { lastReplyAt: loadState().lastReplyAt },
        },
        null,
        2,
      ),
    );
    return true;
  }

  if (url === "/chat/memory" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify(
        {
          dbPath: getMemoryDbPath(),
          whatYouSaid: getWhatYouSaidBrief({ limit: 30 }),
          brief: getAgentContextBrief({ replyLimit: 20 }),
        },
        null,
        2,
      ),
    );
    return true;
  }

  if (url === "/chat/agent-claim" && req.method === "POST") {
    markProcessing();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, job: readQueue() }));
    return true;
  }

  if (url === "/chat/agent-complete" && req.method === "POST") {
    let body = "";
    req.on("data", (c) => {
      body += c;
    });
    req.on("end", () => {
      let data = {};
      try {
        data = JSON.parse(body || "{}");
      } catch {
        res.writeHead(400);
        res.end("invalid json");
        return;
      }
      applyAgentCompletion({
        messageKeys: data.messageKeys || [],
        reply: data.reply || null,
        posted: Boolean(data.posted),
        skipped: Boolean(data.skipped),
        skipReason: data.skipReason || null,
      });
      completeJob({ reply: data.reply, posted: data.posted, error: data.error });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    });
    return true;
  }

  return false;
}
