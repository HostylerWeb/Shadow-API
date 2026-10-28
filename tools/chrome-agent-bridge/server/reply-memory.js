/**
 * Local SQLite memory for YouTube chat replies: dedupe and consistency checks.
 * Default path: ~/.local/state/chrome-agent/reply-memory.sqlite
 */
import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const DEFAULT_DB = join(homedir(), ".local/state/chrome-agent/reply-memory.sqlite");
const DB_PATH = process.env.CHAT_MEMORY_DB || DEFAULT_DB;

/** If we recently said A, do not send B (simple phrase pairs). */
const CONTRADICTION_PAIRS = [
  {
    recent: /\b(i'?m|i am)\s+lebanese\b|\bfrom lebanon\b/i,
    block: /\b(fake|not real|pretend)\s+lebanese\b|\byou'?re not lebanese\b/i,
  },
  {
    recent: /\b(pro-?israel|support israel|back israel|stand with israel)\b/i,
    block: /\bisrael\s+(is\s+)?(evil|fake|a joke|illegitimate|terror state)\b/i,
  },
  {
    recent: /\bhamas\s+(is|are)\s+(terror|terrorists)\b|\blisted terror\b.*\bhamas\b/i,
    block: /\bsupport\s+hamas\b|\bhamas\s+(is\s+)?(resistance|freedom fighters)\b/i,
  },
  {
    recent: /\bhezbollah\b.*\b(terror|iran|militia)\b/i,
    block: /\bhezbollah\s+(is\s+)?(resistance|heroes)\b/i,
  },
  {
    recent: /\b(oct\s*7|october\s*7)\b.*\b(attack|murder|hostage)\b/i,
    block: /\boct\s*7\s+(was|is)\s+(fake|staged|false flag)\b/i,
  },
];

const STANCE_BY_RULE = {
  direct_to_me: [{ topic: "identity", assertion: "Lebanese, pro-Israel, anti-Hamas/Hezbollah" }],
  bot_accusation: [{ topic: "identity", assertion: "Real person, not a bot; anti-terror from Lebanon" }],
  terror: [{ topic: "terror", assertion: "Hamas/Hezbollah are terror; Oct 7 matters" }],
  iran_axis: [{ topic: "iran", assertion: "Iran/IRGC funds proxies against Israel and Lebanon" }],
  anti_israel: [{ topic: "israel", assertion: "Supports Israel; rejects river-to-sea erasure" }],
  anti_democracy: [{ topic: "democracy", assertion: "Israel has democratic institutions and transfers of power" }],
  anti_peace: [{ topic: "peace", assertion: "Peace requires demilitarization and hostage return" }],
  smear_israel_leaders: [{ topic: "leaders", assertion: "Legal process matters; Oct 7 atrocity is primary" }],
  fake_ideology: [{ topic: "antisemitism", assertion: "Rejects genocide/apartheid smears and conspiracy tropes" }],
  curse_attack: [{ topic: "tone", assertion: "Insults are not arguments; cites facts" }],
};

let db;

function normalizeReply(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[.…]+$/g, "")
    .trim();
}

function ensureDb() {
  if (db) return db;
  const dir = dirname(DB_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  db = new DatabaseSync(DB_PATH);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS replies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at INTEGER NOT NULL,
      source TEXT NOT NULL,
      video_url TEXT,
      rule_id TEXT,
      trigger_author TEXT,
      trigger_text TEXT,
      reply_text TEXT NOT NULL,
      reply_norm TEXT NOT NULL,
      posted INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_replies_norm_time ON replies(reply_norm, created_at);
    CREATE INDEX IF NOT EXISTS idx_replies_time ON replies(created_at DESC);
    CREATE TABLE IF NOT EXISTS stances (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at INTEGER NOT NULL,
      topic TEXT NOT NULL,
      assertion TEXT NOT NULL,
      reply_id INTEGER REFERENCES replies(id)
    );
    CREATE INDEX IF NOT EXISTS idx_stances_topic ON stances(topic, created_at DESC);
    CREATE TABLE IF NOT EXISTS banned_phrases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at INTEGER NOT NULL,
      phrase_norm TEXT NOT NULL UNIQUE,
      reason TEXT,
      active INTEGER NOT NULL DEFAULT 1
    );
    CREATE INDEX IF NOT EXISTS idx_banned_active ON banned_phrases(active, phrase_norm);
  `);
  seedBannedPhrases(db);
  return db;
}

const DEFAULT_BANNED_PHRASES = [
  { phrase: "the painter is hitler", reason: "lecture template; sounds like a bot" },
  { phrase: "holocaust denial is not debate", reason: "repeated AI template" },
  { phrase: "six million murdered is documented", reason: "fact-sheet bot line" },
  { phrase: "nazi propaganda", reason: "overused template when paired with painter" },
];

function seedBannedPhrases(d) {
  const ins = d.prepare(
    `INSERT OR IGNORE INTO banned_phrases (created_at, phrase_norm, reason, active)
     VALUES (?, ?, ?, 1)`,
  );
  const now = Date.now();
  for (const row of DEFAULT_BANNED_PHRASES) {
    ins.run(now, normalizeReply(row.phrase), row.reason);
  }
}

function matchesBannedPhrase(text) {
  const norm = normalizeReply(text);
  if (!norm) return null;
  const d = ensureDb();
  const rows = d.prepare(`SELECT phrase_norm, reason FROM banned_phrases WHERE active = 1`).all();
  for (const row of rows) {
    if (norm.includes(row.phrase_norm)) {
      return { phrase: row.phrase_norm, reason: row.reason };
    }
  }
  return null;
}

function importStateJsonIfEmpty() {
  const d = ensureDb();
  const row = d.prepare("SELECT COUNT(*) AS n FROM replies").get();
  if (row.n > 0) return;
  const statePath = process.env.CHAT_STATE_PATH ?? "/tmp/ytchat-agent-state.json";
  if (!existsSync(statePath)) return;
  try {
    const s = JSON.parse(readFileSync(statePath, "utf8"));
    const texts = s.recentReplyTexts || [];
    const now = Date.now();
    const ins = d.prepare(
      `INSERT INTO replies (created_at, source, reply_text, reply_norm, posted)
       VALUES (?, 'import', ?, ?, 1)`,
    );
    for (const t of texts) {
      if (!t || t.length < 8) continue;
      ins.run(now, t, normalizeReply(t));
    }
    if (s.lastReplyText) {
      ins.run(s.lastReplyAt || now, "import", s.lastReplyText, normalizeReply(s.lastReplyText));
    }
  } catch {
    /* ignore */
  }
}

export function getMemoryDbPath() {
  return DB_PATH;
}

export function recordReply({
  source = "unknown",
  videoUrl = null,
  ruleId = null,
  triggerAuthor = null,
  triggerText = null,
  replyText,
  posted = false,
}) {
  const text = String(replyText || "").trim();
  if (text.length < 8) return { id: null };
  const d = ensureDb();
  const now = Date.now();
  const norm = normalizeReply(text);
  const info = d
    .prepare(
      `INSERT INTO replies (created_at, source, video_url, rule_id, trigger_author, trigger_text, reply_text, reply_norm, posted)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(now, source, videoUrl, ruleId, triggerAuthor, triggerText, text, norm, posted ? 1 : 0);

  const replyId = Number(info.lastInsertRowid);
  const stances = STANCE_BY_RULE[ruleId] || [];
  const insStance = d.prepare(
    `INSERT INTO stances (created_at, topic, assertion, reply_id) VALUES (?, ?, ?, ?)`,
  );
  for (const s of stances) {
    insStance.run(now, s.topic, s.assertion, replyId);
  }
  return { id: replyId, createdAt: now };
}

/** 0..1 word overlap on meaningful tokens */
export function replySimilarity(a, b) {
  const words = (t) =>
    normalizeReply(t)
      .split(/\s+/)
      .filter((w) => w.length > 3);
  const ta = new Set(words(a));
  const tb = new Set(words(b));
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const w of ta) if (tb.has(w)) inter++;
  return inter / Math.min(ta.size, tb.size);
}

export function isTooSimilarToRecent(
  text,
  { threshold = 0.5, withinMs = 7200000, limit = 25 } = {},
) {
  const since = Date.now() - withinMs;
  const recent = getRecentReplies(limit).filter((r) => r.created_at >= since);
  return recent.some((r) => replySimilarity(text, r.reply_text) >= threshold);
}

export function isTooSimilarToAny(text, others, threshold = 0.5) {
  return others.some((o) => replySimilarity(text, o) >= threshold);
}

const BANNED_OUTPUT_RE =
  /\bthe painter is hitler\b|\bpainter is hitler\b|\bholocaust denial is not debate\b/i;

export function sanitizeReplyText(text) {
  const t = String(text || "")
    .replace(/\s*[—–]\s*/g, ". ")
    .replace(/\s+/g, " ")
    .trim();
  if (BANNED_OUTPUT_RE.test(t)) return null;
  if (matchesBannedPhrase(t)) return null;
  return t;
}

/** Lines Alex already posted in chat (from DB), for dedupe before send. */
export function getWhatYouSaid({ limit = 25, withinMs = 14 * 86400000, postedOnly = true } = {}) {
  const since = Date.now() - withinMs;
  return getRecentReplies(limit).filter(
    (r) => r.created_at >= since && (!postedOnly || r.posted),
  );
}

export function getWhatYouSaidBrief(opts = {}) {
  const rows = getWhatYouSaid(opts);
  if (!rows.length) {
    return "WHAT YOU SAID: (nothing logged yet — vary wording; never repeat lecture templates.)";
  }
  const lines = [
    "WHAT YOU SAID (do NOT repeat verbatim or near-paraphrase; skip thread if already answered):",
  ];
  for (const r of rows) {
    const when = new Date(r.created_at).toISOString().slice(0, 16);
    const tag = r.rule_id ? ` [${r.rule_id}]` : "";
    lines.push(`- (${when})${tag} ${r.reply_text}`);
  }
  return lines.join("\n");
}

/**
 * Pull your own YouTube chat lines into memory so Cursor knows what you said even if send bypassed MCP.
 */
export function ingestOwnTranscriptLines(messages, ownAuthorRe, { videoUrl = null } = {}) {
  if (!messages?.length || !ownAuthorRe) return { added: 0 };
  const d = ensureDb();
  const known = new Set(
    d
      .prepare(`SELECT reply_norm FROM replies WHERE created_at >= ?`)
      .all(Date.now() - 30 * 86400000)
      .map((r) => r.reply_norm),
  );
  let added = 0;
  for (const m of messages) {
    const author = String(m.author || "");
    const raw = String(m.text || "").trim();
    if (!raw || raw.length < 8) continue;
    if (!ownAuthorRe.test(author) && !ownAuthorRe.test(raw)) continue;
    const body = raw.replace(/@[\w.-]+/g, "").replace(/\s+/g, " ").trim();
    const norm = normalizeReply(body);
    if (!norm || norm.length < 8 || known.has(norm)) continue;
    recordReply({
      source: "transcript",
      videoUrl,
      replyText: body,
      posted: true,
    });
    known.add(norm);
    added++;
  }
  return { added };
}

/**
 * Before posting: duplicate, similarity, banned templates, contradiction.
 */
export function checkReplyDraft(text, { ownLinesInTranscript = [], withinMs } = {}) {
  const trimmed = String(text || "").trim();
  const warnings = [];
  if (trimmed.length < 8) {
    return { ok: false, warnings: [{ code: "too_short" }], text: null };
  }
  const sanitized = sanitizeReplyText(trimmed);
  if (!sanitized) {
    const ban = matchesBannedPhrase(trimmed);
    warnings.push({
      code: "banned_template",
      detail: ban?.reason || "matches banned lecture template",
    });
    return { ok: false, warnings, text: null };
  }
  const dupMs = withinMs ?? 86400000;
  if (wasReplyUsedRecently(sanitized, dupMs)) {
    warnings.push({ code: "exact_duplicate_recent" });
  }
  if (isTooSimilarToRecent(sanitized, { withinMs: dupMs })) {
    warnings.push({ code: "too_similar_to_past_reply" });
  }
  if (ownLinesInTranscript?.length && isTooSimilarToAny(sanitized, ownLinesInTranscript, 0.45)) {
    warnings.push({ code: "too_similar_to_transcript" });
  }
  const contradiction = checkContradiction(sanitized);
  if (!contradiction.ok) {
    warnings.push({
      code: contradiction.reason,
      conflictWith: contradiction.conflictWith,
    });
  }
  return { ok: warnings.length === 0, warnings, text: sanitized };
}

export function wasReplyUsedRecently(replyText, withinMs = 300000) {
  const norm = normalizeReply(replyText);
  if (!norm) return false;
  const d = ensureDb();
  const since = Date.now() - withinMs;
  const row = d
    .prepare(`SELECT 1 FROM replies WHERE reply_norm = ? AND created_at >= ? LIMIT 1`)
    .get(norm, since);
  return Boolean(row);
}

export function filterUnusedVariants(variants, { withinMs = 86400000, seed = "" } = {}) {
  const list = variants.filter(Boolean);
  if (!list.length) return [];
  const d = ensureDb();
  const since = Date.now() - withinMs;
  const used = new Set(
    d
      .prepare(`SELECT reply_norm FROM replies WHERE created_at >= ?`)
      .all(since)
      .map((r) => r.reply_norm),
  );
  return list.filter((v) => !used.has(normalizeReply(v)));
}

/**
 * @returns {{ ok: true } | { ok: false, reason: string, conflictWith?: string }}
 */
export function checkContradiction(replyText, lookbackMs = 7 * 86400000) {
  const text = String(replyText || "");
  const d = ensureDb();
  const since = Date.now() - lookbackMs;
  const recentTexts = d
    .prepare(`SELECT reply_text FROM replies WHERE created_at >= ? ORDER BY created_at DESC LIMIT 40`)
    .all(since)
    .map((r) => r.reply_text);

  for (const past of recentTexts) {
    for (const pair of CONTRADICTION_PAIRS) {
      if (pair.recent.test(past) && pair.block.test(text)) {
        return {
          ok: false,
          reason: "contradicts_recent_reply",
          conflictWith: past.slice(0, 120),
        };
      }
      if (pair.recent.test(text) && pair.block.test(past)) {
        return {
          ok: false,
          reason: "contradicts_earlier_position",
          conflictWith: past.slice(0, 120),
        };
      }
    }
  }
  return { ok: true };
}

export function getRecentReplies(limit = 25) {
  const d = ensureDb();
  return d
    .prepare(
      `SELECT created_at, source, rule_id, trigger_text, reply_text, posted
       FROM replies ORDER BY created_at DESC LIMIT ?`,
    )
    .all(limit);
}

export function getStanceBrief(limit = 12) {
  const d = ensureDb();
  const rows = d
    .prepare(
      `SELECT topic, assertion, MAX(created_at) AS at
       FROM stances GROUP BY topic, assertion ORDER BY at DESC LIMIT ?`,
    )
    .all(limit);
  return rows;
}

/** Short text for agents before drafting a manual reply. */
export function getAgentContextBrief({ replyLimit = 12, stanceLimit = 10 } = {}) {
  importStateJsonIfEmpty();
  const stances = getStanceBrief(stanceLimit);
  const whatYouSaid = getWhatYouSaidBrief({ limit: replyLimit });
  const lines = [whatYouSaid];
  if (stances.length) {
    lines.push("", "Standing positions (stay consistent, do not contradict):");
    for (const s of stances) {
      lines.push(`- ${s.topic}: ${s.assertion}`);
    }
  }
  return lines.join("\n").trim();
}

export function addBannedPhrase(phrase, reason = "user banned") {
  const norm = normalizeReply(phrase);
  if (!norm) return { ok: false };
  const d = ensureDb();
  d.prepare(
    `INSERT INTO banned_phrases (created_at, phrase_norm, reason, active)
     VALUES (?, ?, ?, 1)
     ON CONFLICT(phrase_norm) DO UPDATE SET reason = excluded.reason, active = 1`,
  ).run(Date.now(), norm, reason);
  return { ok: true, phrase_norm: norm };
}

export function initReplyMemory() {
  ensureDb();
  importStateJsonIfEmpty();
}
