#!/usr/bin/env node
/**
 * One poll: snapshot 15m + 5m TradingView tabs, append JSONL, update latest.json.
 */
import {
  disconnectBridgeClient,
  ensureBridgeReady,
} from "../../chrome-agent-bridge/server/bridge.js";
import { runXauTick } from "./xau-tick-core.mjs";

const started = Date.now();
let exitCode = 0;

try {
  await ensureBridgeReady();
  const { summary } = await runXauTick({ started });
  console.log(JSON.stringify(summary));
} catch (err) {
  exitCode = 1;
  const message = err instanceof Error ? err.message : String(err);
  const { writeStatus } = await import("./xau-store.js");
  writeStatus({
    ok: false,
    ts: new Date().toISOString(),
    error: message,
  });
  console.error(JSON.stringify({ ok: false, error: message }));
} finally {
  disconnectBridgeClient();
  process.exit(exitCode);
}
