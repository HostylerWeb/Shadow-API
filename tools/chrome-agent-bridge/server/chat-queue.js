import { readFileSync, writeFileSync, existsSync, unlinkSync } from "node:fs";

const QUEUE_PATH = process.env.CHAT_AGENT_QUEUE_PATH ?? "/tmp/ytchat-agent-queue.json";
const LOCK_MS = Number(process.env.CHAT_AGENT_LOCK_MS ?? 120000);

export function readQueue() {
  if (!existsSync(QUEUE_PATH)) return null;
  try {
    return JSON.parse(readFileSync(QUEUE_PATH, "utf8"));
  } catch {
    return null;
  }
}

/** Job the agent should act on (not completed / errored). */
export function readActiveQueue() {
  const q = readQueue();
  if (!q) return null;
  if (q.status === "done" || q.status === "error") return null;
  if (!q.candidates?.length) return null;
  return q;
}

export function writeQueue(job) {
  writeFileSync(QUEUE_PATH, JSON.stringify({ ...job, updatedAt: Date.now() }, null, 2));
}

export function clearQueue() {
  try {
    unlinkSync(QUEUE_PATH);
  } catch {
    /* ignore */
  }
}

/** @returns {boolean} false if another agent turn is still in progress */
export function enqueueJob(job) {
  const existing = readQueue();
  if (existing?.status === "processing" && Date.now() - (existing.updatedAt || 0) < LOCK_MS) {
    return false;
  }
  if (existing?.status === "pending") {
    return false;
  }
  if (existing?.status === "done" || existing?.status === "error") {
    clearQueue();
  }
  writeQueue({
    status: "pending",
    ...job,
  });
  return true;
}

export function markProcessing() {
  const q = readQueue();
  if (!q) return;
  writeQueue({ ...q, status: "processing" });
}

export function completeJob({ reply, posted, error } = {}) {
  const q = readQueue();
  writeFileSync(
    QUEUE_PATH,
    JSON.stringify(
      {
        ...q,
        status: error ? "error" : "done",
        reply: reply ?? null,
        posted: posted ?? false,
        error: error ?? null,
        completedAt: Date.now(),
      },
      null,
      2,
    ),
  );
  setTimeout(() => clearQueue(), 5000);
}

export function getQueuePath() {
  return QUEUE_PATH;
}
