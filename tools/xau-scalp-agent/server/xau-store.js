import fs from "node:fs";
import {
  getContextPath,
  getDecisionsPath,
  getLatestPath,
  getStateDir,
  getStatusPath,
  getTicksPath,
  slimTf,
} from "./xau-store-paths.js";
import {
  appendDecisionRecord,
  appendSlimTick,
  getRetentionConfig,
} from "./xau-retention.js";

export {
  getBars5mPath,
  getBars15mPath,
  getContextPath,
  getDecisionsPath,
  getLatestPath,
  getStateDir,
  getStatusPath,
  getTicksPath,
  slimTf,
} from "./xau-store-paths.js";

export { getRetentionConfig, appendBarClose, barCloseRecord } from "./xau-retention.js";

export function readLatest() {
  const p = getLatestPath();
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

export function appendTick(record) {
  appendSlimTick(record, getRetentionConfig());
}

export function appendDecision(record) {
  appendDecisionRecord(record, getRetentionConfig());
}

export function writeLatest(payload) {
  fs.writeFileSync(getLatestPath(), JSON.stringify(payload, null, 2), "utf8");
}

export function writeContext(ctx) {
  fs.writeFileSync(getContextPath(), JSON.stringify(ctx, null, 2), "utf8");
}

export function writeStatus(status) {
  fs.writeFileSync(getStatusPath(), JSON.stringify(status, null, 2), "utf8");
}

function bucket5mFromTs(ts) {
  if (!ts) return null;
  const t = new Date(ts).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor(t / (5 * 60 * 1000));
}

function bucket15mFromTs(ts) {
  if (!ts) return null;
  const t = new Date(ts).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor(t / (15 * 60 * 1000));
}

/** @returns {{ isNew5mBar: boolean, isNew15mBar: boolean, bucket5m: number, bucket15m: number }} */
export function detectBarChange(prev, _next, now = new Date()) {
  const bucket5m = Math.floor(now.getTime() / (5 * 60 * 1000));
  const bucket15m = Math.floor(now.getTime() / (15 * 60 * 1000));
  const prev5 = prev?.bucket5m ?? bucket5mFromTs(prev?.ts) ?? null;
  const prev15 = prev?.bucket15m ?? bucket15mFromTs(prev?.ts) ?? null;
  const isNew5mBar = prev5 != null && bucket5m !== prev5;
  const isNew15mBar = prev15 != null && bucket15m !== prev15;
  return { isNew5mBar, isNew15mBar, bucket5m, bucket15m };
}
