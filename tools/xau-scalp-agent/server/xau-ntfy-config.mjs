import fs from "node:fs";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import { getStateDir } from "./xau-store-paths.js";

export function getNtfyConfigPath() {
  return process.env.XAU_NTFY_CONFIG || path.join(getStateDir(), "ntfy-config.json");
}

function lanIp() {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const addr of ifaces[name] || []) {
      if (addr.family === "IPv4" && !addr.internal) return addr.address;
    }
  }
  return "127.0.0.1";
}

/** @returns {{ enabled: boolean, server: string, topic: string }} */
export function loadNtfyConfig() {
  if (process.env.XAU_NTFY === "0") {
    return { enabled: false, server: "", topic: "" };
  }

  const p = getNtfyConfigPath();
  if (fs.existsSync(p)) {
    const cfg = JSON.parse(fs.readFileSync(p, "utf8"));
    return {
      enabled: cfg.enabled !== false,
      server: (process.env.XAU_NTFY_SERVER || cfg.server || "").replace(/\/$/, ""),
      topic: process.env.XAU_NTFY_TOPIC || cfg.topic || "",
    };
  }

  const ip = lanIp();
  const topic = `xau-scalp-${crypto.randomBytes(8).toString("hex")}`;
  const cfg = {
    enabled: true,
    server: process.env.XAU_NTFY_SERVER || `http://${ip}:2586`,
    topic,
    createdAt: new Date().toISOString(),
    note: "Subscribe in ntfy app: add this server, then subscribe to topic (topic is the password).",
  };
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, `${JSON.stringify(cfg, null, 2)}\n`);
  return { enabled: true, server: cfg.server, topic: cfg.topic };
}
