import { WebSocket, WebSocketServer } from "ws";

const PORT = Number(process.env.CHROME_BRIDGE_PORT ?? 17321);

/** @type {Set<import("ws").WebSocket>} */
const extensionSockets = new Set();

/** @type {import("ws").WebSocket | null} */
let mcpClientSocket = null;

/** "server" = this process owns the hub; "client" = attached to an existing hub */
let mode = "server";

const pending = new Map();

function settlePending(id, msg) {
  const entry = pending.get(id);
  if (!entry) return;
  pending.delete(id);
  clearTimeout(entry.timer);
  if (entry.clientWs) {
    entry.clientWs.send(JSON.stringify(msg));
    return;
  }
  if (msg.error) entry.reject(new Error(msg.error));
  else entry.resolve(msg.result);
}

export function extensionConnected() {
  if (mode === "server") {
    for (const ws of extensionSockets) {
      if (ws.readyState === 1) return true;
    }
    return false;
  }
  return mcpClientSocket?.readyState === 1;
}

function getOpenExtensionSockets() {
  return [...extensionSockets].filter((ws) => ws.readyState === 1);
}

function sendExtensionRequest(id, method, params) {
  const open = getOpenExtensionSockets();
  if (!open.length) {
    throw new Error("Chrome extension not connected. Load the extension in Chrome.");
  }
  for (const ws of open) {
    ws.send(JSON.stringify({ id, type: "request", method, params }));
  }
  return open.length;
}

function handleExtensionResponse(msg) {
  const entry = pending.get(msg.id);
  if (!entry) return;

  if (entry.method === "tabs.list") {
    entry.responses = entry.responses || [];
    if (Array.isArray(msg.result)) {
      entry.responses.push(...msg.result);
    }
    entry.remaining = (entry.remaining ?? 1) - 1;
    if (entry.remaining <= 0) {
      settlePending(msg.id, { id: msg.id, type: "response", result: entry.responses });
    }
    return;
  }

  if (!msg.error) {
    settlePending(msg.id, msg);
    return;
  }

  entry.lastError = msg.error;
  entry.remaining = (entry.remaining ?? 1) - 1;
  if (entry.remaining <= 0) {
    settlePending(msg.id, { id: msg.id, type: "response", error: entry.lastError });
  }
}

export function requestExtension(method, params = {}, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Extension request timed out: ${method}`));
    }, timeoutMs);

    if (mode === "client") {
      if (!mcpClientSocket || mcpClientSocket.readyState !== 1) {
        clearTimeout(timer);
        reject(new Error("Not connected to local bridge. Start Start-Chrome-Agent-Bridge or MCP."));
        return;
      }
      pending.set(id, { resolve, reject, timer });
      mcpClientSocket.send(JSON.stringify({ id, type: "request", method, params }));
      return;
    }

    try {
      const count = getOpenExtensionSockets().length;
      pending.set(id, { resolve, reject, timer, method, remaining: count, responses: [] });
      sendExtensionRequest(id, method, params);
    } catch (err) {
      pending.delete(id);
      clearTimeout(timer);
      reject(err);
    }
  });
}

function attachHub(wss) {
  wss.on("connection", (ws, req) => {
    const path = (req.url ?? "").split("?")[0];

    if (path.startsWith("/extension")) {
      extensionSockets.add(ws);
      console.error(
        `[bridge] extension connected ws://127.0.0.1:${PORT}/extension (profiles=${extensionSockets.size})`,
      );

      ws.on("message", (raw) => {
        let msg;
        try {
          msg = JSON.parse(String(raw));
        } catch {
          return;
        }
        if (msg.type === "response" && msg.id) handleExtensionResponse(msg);
      });

      ws.on("close", () => {
        extensionSockets.delete(ws);
        console.error(`[bridge] extension disconnected (profiles=${extensionSockets.size})`);
      });
      return;
    }

    if (path.startsWith("/mcp")) {
      console.error("[bridge] MCP client connected");
      ws.on("message", (raw) => {
        let msg;
        try {
          msg = JSON.parse(String(raw));
        } catch {
          return;
        }
        if (msg.type !== "request" || !msg.id) return;

        const timer = setTimeout(() => {
          const entry = pending.get(msg.id);
          if (entry?.method === "tabs.list" && entry.responses?.length) {
            settlePending(msg.id, { id: msg.id, type: "response", result: entry.responses });
            return;
          }
          pending.delete(msg.id);
          ws.send(JSON.stringify({ id: msg.id, type: "response", error: "Extension request timed out" }));
        }, 15000);

        try {
          const count = getOpenExtensionSockets().length;
          pending.set(msg.id, {
            timer,
            clientWs: ws,
            method: msg.method,
            remaining: count,
            responses: [],
          });
          sendExtensionRequest(msg.id, msg.method, msg.params ?? {});
        } catch (err) {
          pending.delete(msg.id);
          clearTimeout(timer);
          ws.send(JSON.stringify({
            id: msg.id,
            type: "response",
            error: err instanceof Error ? err.message : String(err),
          }));
        }
      });
      return;
    }

    ws.close(4000, "Use /extension or /mcp");
  });
}

export function startBridge() {
  return new Promise((resolve, reject) => {
    const wss = new WebSocketServer({ host: "127.0.0.1", port: PORT });

    wss.once("listening", () => {
      mode = "server";
      console.error(`[bridge] listening ws://127.0.0.1:${PORT} (/extension, /mcp)`);
      resolve(wss);
    });

    wss.once("error", (err) => {
      wss.close();
      reject(err);
    });

    attachHub(wss);
  });
}

export function connectMcpClient() {
  return new Promise((resolve, reject) => {
    const url = `ws://127.0.0.1:${PORT}/mcp`;
    const ws = new WebSocket(url);

    ws.once("open", () => {
      mode = "client";
      mcpClientSocket = ws;
      console.error(`[bridge] MCP attached to ${url}`);
      resolve(ws);
    });

    ws.once("error", (err) => reject(err));

    ws.on("message", (raw) => {
      let msg;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }
      if (msg.type === "response" && msg.id) settlePending(msg.id, msg);
    });

    ws.on("close", () => {
      if (mcpClientSocket === ws) {
        mcpClientSocket = null;
        if (mode === "client") {
          setTimeout(() => {
            if (mode === "client" && !mcpClientSocket) {
              connectMcpClient().catch(() => {});
            }
          }, 2000);
        }
      }
    });
  });
}

export async function ensureBridgeReady() {
  try {
    await startBridge();
  } catch (err) {
    if (err?.code === "EADDRINUSE") {
      await connectMcpClient();
      return;
    }
    throw err;
  }
}

/** Close MCP client attachment so one-shot CLI scripts can process.exit(0). */
export function disconnectBridgeClient() {
  mode = "server";
  if (mcpClientSocket) {
    mcpClientSocket.close();
    mcpClientSocket = null;
  }
}

import http from "node:http";
import { pathToFileURL } from "node:url";

function startHealthServer() {
  const healthPort = Number(process.env.CHROME_BRIDGE_HEALTH_PORT ?? 17320);
  http
    .createServer((req, res) => {
      if (req.url === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            ok: true,
            extensionConnected: extensionConnected(),
            connectedProfiles: getOpenExtensionSockets().length,
            wsPort: PORT,
          }),
        );
        return;
      }
      if (req.url === "/memory/context") {
        void import("./reply-memory.js").then(({ getAgentContextBrief, getMemoryDbPath }) => {
          res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
          res.end(`${getAgentContextBrief()}\n\n(db: ${getMemoryDbPath()})\n`);
        });
        return;
      }
      void import("./chat-agent-http.js").then(({ handleChatAgentHttp }) => {
        if (handleChatAgentHttp(req, res, req.url?.split("?")[0])) return;
        res.writeHead(404);
        res.end();
      });
      return;
      res.end();
    })
    .listen(healthPort, "127.0.0.1", () => {
      console.error(`[bridge] health http://127.0.0.1:${healthPort}/health`);
    });
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  void startBridge().then(async () => {
    startHealthServer();
    if (process.env.CHAT_WATCH === "1") {
      const { runChatWatch } = await import("./chat-watch.js");
      void runChatWatch({ embedded: true });
    }
  });
}
