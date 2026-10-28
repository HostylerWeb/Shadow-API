#!/usr/bin/env node
/** One-shot read of TradingView tabs; exits cleanly (does not leave a hung node process). */
import {
  disconnectBridgeClient,
  ensureBridgeReady,
  requestExtension,
} from "../chrome-agent-bridge/server/bridge.js";
import { detectTimeframe } from "./server/parse-snapshot.js";

await ensureBridgeReady();
try {
  const tabs = await requestExtension("tabs.list");
  for (const t of tabs.filter((x) => /tradingview\.com/i.test(x.url || ""))) {
    const snap = await requestExtension("page.command", {
      tabId: t.id,
      command: "snapshot",
      args: {},
    });
    const text = (snap.text || snap.data?.text || "").replace(/\s+/g, " ").slice(0, 2400);
    const kind = detectTimeframe(text) ?? "?";
    console.log(JSON.stringify({ kind, tabId: t.id, active: t.active, text }, null, 2));
  }
} finally {
  disconnectBridgeClient();
  process.exit(0);
}
