#!/usr/bin/env node
/**
 * Persistent XAU poll loop: one MCP connection, interval sleep, AGENT_LOOP_TICK_xau sentinel.
 */
import {
  disconnectBridgeClient,
  ensureBridgeReady,
} from "../../chrome-agent-bridge/server/bridge.js";
import { runXauTick } from "./xau-tick-core.mjs";
import { getTicksPath, writeStatus } from "./xau-store.js";
import { getNewsConfig, refreshForexCalendar } from "./xau-forex-calendar.mjs";
import { fileURLToPath } from "node:url";

const INTERVAL_SEC = Math.max(5, Number(process.env.XAU_AGENT_LOOP_SEC || 60));
const PROMPT =
  process.env.XAU_TICK_PROMPT ||
  "XAU tick: Run node server/xau-agent-brief.mjs and paste full output to user (Action/Why/When). Then AGENT-LOOP-PROMPT.md hard filters. On isNew5mBar log evaluation. Paste brief every tick.";

function emitAgentWake() {
  console.log("AGENT_LOOP_TICK_xau", JSON.stringify({ prompt: PROMPT }));
}

async function emitUserBrief() {
  if (process.env.XAU_EMIT_BRIEF === "0") return;
  const { spawnSync } = await import("node:child_process");
  const r = spawnSync(
    process.execPath,
    [fileURLToPath(new URL("./xau-agent-brief.mjs", import.meta.url))],
    { encoding: "utf8" },
  );
  const text = (r.stdout || "").trim();
  if (!text) return;
  console.log("XAU_AGENT_BRIEF_START");
  console.log(text);
  console.log("XAU_AGENT_BRIEF_END");
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

console.error(`[xau-loop] every ${INTERVAL_SEC}s — persistent bridge — ticks → ${getTicksPath()}`);

const calendarCfg = getNewsConfig();
let loopTick = 0;

async function maybeRefreshCalendar() {
  loopTick += 1;
  if (loopTick !== 1 && loopTick % calendarCfg.everyNTicks !== 0) return;
  try {
    const summary = await refreshForexCalendar();
    console.error(
      `[xau-loop] calendar ok — ${summary.totalMatched} events, inBlackout=${summary.inBlackout}`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[xau-loop] calendar fetch failed: ${message}`);
  }
}

let stopping = false;
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    stopping = true;
  });
}

try {
  await ensureBridgeReady();
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  writeStatus({ ok: false, ts: new Date().toISOString(), error: message });
  console.error(JSON.stringify({ ok: false, error: message }));
  process.exit(1);
}

while (!stopping) {
  const started = Date.now();
  await maybeRefreshCalendar();
  try {
    const { summary } = await runXauTick({ started });
    console.log(JSON.stringify(summary));
    await emitUserBrief();
    if (process.env.XAU_EMIT_NOTIFY === "1") {
      const { spawnSync } = await import("node:child_process");
      const notify = spawnSync(
        process.execPath,
        [fileURLToPath(new URL("./xau-agent-notify.mjs", import.meta.url))],
        { encoding: "utf8" },
      );
      const out = (notify.stdout || "").trim();
      if (out) console.log("XAU_AGENT_CHAT", out);
    }
    if (process.env.XAU_NTFY !== "0") {
      const { spawnSync } = await import("node:child_process");
      spawnSync(
        process.execPath,
        [fileURLToPath(new URL("./xau-ntfy-push.mjs", import.meta.url))],
        { encoding: "utf8", stdio: "inherit" },
      );
    }
    emitAgentWake();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    writeStatus({ ok: false, ts: new Date().toISOString(), error: message });
    console.error(JSON.stringify({ ok: false, error: message }));
    emitAgentWake();
  }

  const elapsed = Date.now() - started;
  const waitMs = Math.max(0, INTERVAL_SEC * 1000 - elapsed);
  if (stopping) break;
  await sleep(waitMs);
}

disconnectBridgeClient();
process.exit(0);
