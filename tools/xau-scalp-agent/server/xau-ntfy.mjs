import fs from "node:fs";
import path from "node:path";
import { loadNtfyConfig, getNtfyConfigPath } from "./xau-ntfy-config.mjs";
import { getStateDir } from "./xau-store-paths.js";

function dedupePath() {
  return path.join(getStateDir(), "ntfy-dedupe.json");
}

function wasSent(eventKey) {
  const p = dedupePath();
  if (!fs.existsSync(p)) return false;
  try {
    const { keys } = JSON.parse(fs.readFileSync(p, "utf8"));
    return Array.isArray(keys) && keys.includes(eventKey);
  } catch {
    return false;
  }
}

function markSent(eventKey) {
  const p = dedupePath();
  let keys = [];
  if (fs.existsSync(p)) {
    try {
      keys = JSON.parse(fs.readFileSync(p, "utf8")).keys || [];
    } catch {
      keys = [];
    }
  }
  keys.push(eventKey);
  if (keys.length > 100) keys = keys.slice(-100);
  fs.writeFileSync(p, `${JSON.stringify({ keys, last: eventKey, at: new Date().toISOString() }, null, 2)}\n`);
}

export function plainText(md) {
  return String(md || "")
    .replace(/\*\*/g, "")
    .replace(/`/g, "")
    .replace(/\n+/g, " ")
    .trim()
    .slice(0, 3800);
}

/**
 * @param {{ title: string, body: string, priority?: string, tags?: string, eventKey: string }} msg
 */
export async function sendNtfy(msg) {
  const cfg = loadNtfyConfig();
  if (!cfg.enabled || !cfg.server || !cfg.topic) {
    return { ok: false, skipped: true, reason: "ntfy disabled or not configured" };
  }
  if (wasSent(msg.eventKey)) {
    return { ok: true, skipped: true, reason: "duplicate" };
  }

  const url = `${cfg.server}/${encodeURIComponent(cfg.topic)}`;
  const headers = {
    Title: msg.title.slice(0, 250),
    Priority: msg.priority || "default",
  };
  if (msg.tags) headers.Tags = msg.tags;

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: plainText(msg.body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false, status: res.status, error: text.slice(0, 200) };
  }

  markSent(msg.eventKey);
  return { ok: true, topic: cfg.topic, server: cfg.server };
}

export function showNtfySetup() {
  const cfg = loadNtfyConfig();
  const p = getNtfyConfigPath();
  const base = cfg.server.replace(/\/$/, "");
  const deepLink = `ntfy://${base.replace(/^https?:\/\//, "")}/${cfg.topic}?secure=false`;
  console.log(
    [
      "XAU ntfy setup (Android, same Wi-Fi):",
      "",
      "Easiest — open this link on the phone (Chrome → opens ntfy app):",
      deepLink,
      "",
      "Or manual:",
      `1. Settings → Default server → type exactly (lowercase http): ${base}`,
      `2. + Subscribe → topic: ${cfg.topic}`,
      "3. Turn off keyboard auto-capitalize for the URL field (Http:// is rejected).",
      "",
      `Config file: ${p}`,
      "Test: node server/xau-scalp-agent/server/xau-ntfy-push.mjs --test",
    ].join("\n"),
  );
}
