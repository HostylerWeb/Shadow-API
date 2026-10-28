/**
 * Finance Calendar → XAU news context.
 * Public JSON: https://www.financecalendar.com/wp-json/fc/v1/calendar-view
 * (The /api/forex-calendar/ path is the website UI, not JSON.)
 */
import fs from "node:fs";
import { getStateDir } from "./xau-store-paths.js";

const DEFAULT_URL =
  process.env.XAU_CALENDAR_API_URL ||
  "https://www.financecalendar.com/wp-json/fc/v1/calendar-view";

const USER_AGENT = process.env.XAU_CALENDAR_USER_AGENT || "ShadowAPI-xau-scalp-agent/1.0";

const GOLD_CRITICAL = [
  "fomc",
  "cpi",
  "nfp",
  "nonfarm",
  "payroll",
  "pce",
  "gdp",
  "jobless",
  "inflation",
  "fed ",
  "interest rate",
];

export function getNewsCalendarPath() {
  return `${getStateDir()}/news-calendar.json`;
}

function numEnv(name, fallback) {
  const v = process.env[name];
  if (v == null || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function getNewsConfig() {
  return {
    apiUrl: DEFAULT_URL,
    blackoutMinutes: numEnv("XAU_NEWS_BLACKOUT_MIN", 30),
    lookaheadHours: numEnv("XAU_NEWS_LOOKAHEAD_HOURS", 72),
    everyNTicks: numEnv("XAU_CALENDAR_EVERY_N_TICKS", 10),
    maxStaleMinutes: numEnv("XAU_NEWS_MAX_STALE_MIN", 90),
  };
}

function parseReleaseUtc(ev) {
  const t = ev.release_at_utc || ev.time_utc;
  if (t) {
    const d = new Date(t);
    if (!Number.isNaN(d.getTime())) return d;
  }
  if (ev.date) {
    const d = new Date(`${ev.date}T12:00:00Z`);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

function isGoldCritical(title) {
  const t = String(title || "").toLowerCase();
  return GOLD_CRITICAL.some((k) => t.includes(k));
}

function relevance(ev) {
  const country = ev.country || "";
  const impact = String(ev.impact || "").toLowerCase();
  const title = ev.name || ev.title || "";

  if (country === "US" && impact === "high") return { tier: "us_high", title };
  if (country === "US" && impact === "medium" && isGoldCritical(title)) return { tier: "us_medium_critical", title };
  if (country === "US" && impact === "medium") return { tier: "us_medium", title };
  if (country === "EU" && impact === "high") return { tier: "eu_high", title };
  if (country === "GB" && impact === "high") return { tier: "gb_high", title };
  if (country === "DE" && impact === "high") return { tier: "de_high", title };
  return null;
}

/**
 * @returns {Promise<object>} summary written to news-calendar.json
 */
export async function refreshForexCalendar(now = new Date()) {
  const cfg = getNewsConfig();
  const res = await fetch(cfg.apiUrl, {
    headers: { Accept: "application/json", "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) {
    throw new Error(`Calendar HTTP ${res.status}`);
  }
  const data = await res.json();
  const events = Array.isArray(data.events) ? data.events : [];
  const nowMs = now.getTime();
  const horizonMs = cfg.lookaheadHours * 3600 * 1000;
  const blackoutMs = cfg.blackoutMinutes * 60 * 1000;

  const upcoming = [];
  for (const ev of events) {
    const rel = relevance(ev);
    if (!rel) continue;
    const at = parseReleaseUtc(ev);
    if (!at) continue;
    const atMs = at.getTime();
    if (atMs < nowMs - 3600_000) continue;
    if (atMs > nowMs + horizonMs) continue;
    const delta = atMs - nowMs;
    upcoming.push({
      id: ev.id,
      at: at.toISOString(),
      minutesUntil: Math.round(delta / 60_000),
      country: ev.country,
      impact: ev.impact,
      title: rel.title,
      tier: rel.tier,
      critical: isGoldCritical(rel.title),
      inBlackoutWindow: Math.abs(delta) <= blackoutMs,
    });
  }

  upcoming.sort((a, b) => a.at.localeCompare(b.at));

  const inBlackout = upcoming.some((e) => e.inBlackoutWindow && (e.impact === "high" || e.critical));
  const nextHigh = upcoming.find((e) => e.impact === "high" || e.critical) || upcoming[0] || null;

  const summary = {
    ok: true,
    fetchedAt: now.toISOString(),
    source: cfg.apiUrl,
    viewFrom: data.from ?? null,
    viewTo: data.to ?? null,
    timezone: data.timezone ?? null,
    blackoutMinutes: cfg.blackoutMinutes,
    inBlackout,
    nextHighImpact: nextHigh,
    upcoming: upcoming.slice(0, 12),
    totalMatched: upcoming.length,
  };

  fs.writeFileSync(getNewsCalendarPath(), JSON.stringify(summary, null, 2), "utf8");
  return summary;
}

export function readNewsCalendar() {
  const p = getNewsCalendarPath();
  if (!fs.existsSync(p)) {
    return { ok: false, stale: true, error: "not_fetched", inBlackout: false, upcoming: [] };
  }
  try {
    const j = JSON.parse(fs.readFileSync(p, "utf8"));
    const cfg = getNewsConfig();
    const fetchedMs = j.fetchedAt ? Date.parse(j.fetchedAt) : NaN;
    const ageMin = Number.isFinite(fetchedMs) ? (Date.now() - fetchedMs) / 60_000 : Infinity;
    const stale = !Number.isFinite(ageMin) || ageMin > cfg.maxStaleMinutes;
    return {
      ...j,
      ok: Boolean(j.ok) && !stale && Array.isArray(j.upcoming),
      stale,
      ageMinutes: Number.isFinite(ageMin) ? Math.round(ageMin) : null,
    };
  } catch {
    return { ok: false, stale: true, error: "parse_error", inBlackout: false, upcoming: [] };
  }
}
