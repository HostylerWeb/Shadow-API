function setStatus(connected) {
  chrome.storage.local.set({ bridgeConnected: connected });
}

const BRIDGE_URL = "ws://127.0.0.1:17321/extension";

let socket = null;
let reconnectTimer = null;

function sendToBridge(payload) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
}

function connectBridge() {
  if (socket?.readyState === WebSocket.OPEN || socket?.readyState === WebSocket.CONNECTING) return;
  socket = new WebSocket(BRIDGE_URL);
  socket.addEventListener("open", () => {
    setStatus(true);
    sendToBridge({ type: "event", event: "extension.connected", version: "0.1.25" });
  });
  socket.addEventListener("message", (ev) => {
    let msg;
    try {
      msg = JSON.parse(String(ev.data));
    } catch {
      return;
    }
    if (msg.type === "request") void handleBridgeRequest(msg);
  });
  socket.addEventListener("close", () => {
    setStatus(false);
    socket = null;
    if (!reconnectTimer) {
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connectBridge();
      }, 3000);
    }
  });
}

/** Runs in page + iframes (YouTube live chat). Must stay self-contained for executeScript. */
function bridgePageCommand(command, args) {
  const textOf = (el) => (el?.innerText || el?.textContent || "").replace(/\s+/g, " ").trim();

  const normalizeLiveChatText = (author, text) => {
    let t = String(text || "").replace(/\u200b/g, "").replace(/\s+/g, " ").trim();
    const handle = String(author || "").replace(/^@/, "").trim();
    if (handle) {
      const prefix = new RegExp(`^@${handle}\\b\\s*`, "i");
      t = t.replace(prefix, "").trim();
    }
    return t;
  };

  if (command === "snapshot" || command === "tradingviewChart") {
    const chunks = [];
    const push = (t) => {
      const s = String(t || "").replace(/\s+/g, " ").trim();
      if (s.length > 4) chunks.push(s);
    };
    push(document.title);
    push(location.href);

    const isTv = /tradingview\.com/i.test(location.hostname);
    if (isTv) {
      const selectors = [
        '[data-name="legend-source-item"]',
        '[class*="legendSourceItem"]',
        '[class*="pane-legend"]',
        '[class*="legendSourceWrapper"]',
        '[class*="chart-markup-table"]',
        '[class*="chart-gui-wrapper"]',
        '[class*="chart-container"]',
        '[class*="valuesWrapper"]',
        '[class*="valueItem"]',
        '[data-name="legend"]',
      ];
      for (const sel of selectors) {
        for (const el of document.querySelectorAll(sel)) {
          push(textOf(el));
          for (const row of el.querySelectorAll("[class*='title'], [class*='value']")) {
            push(textOf(row));
          }
        }
      }
    }

    const main =
      document.querySelector('[class*="chart-container"]') ||
      document.querySelector("main") ||
      document.querySelector("#primary") ||
      document.body;
    push(textOf(main));
    push(textOf(document.body));

    const uniq = [];
    const seen = new Set();
    for (const c of chunks) {
      if (seen.has(c)) continue;
      seen.add(c);
      uniq.push(c);
    }
    const text = uniq.join("\n").slice(0, 16000);
    return {
      frameUrl: location.href,
      title: document.title,
      text,
      mode: isTv ? "tradingviewChart" : "page",
    };
  }

  if (command === "extractComments" || command === "extractLiveChat") {
    const chat = [];
    const selectors =
      "yt-live-chat-text-message-renderer, ytd-live-chat-text-message-renderer, ytd-live-chat-paid-message-renderer";
    for (const el of document.querySelectorAll(selectors)) {
      const author = textOf(el.querySelector("#author-name, #name"));
      const raw = textOf(el.querySelector("#message, #content"));
      const text = normalizeLiveChatText(author, raw);
      if (text) chat.push({ author: author || "?", text: text.slice(0, 500) });
    }
    if (chat.length) {
      return { frameUrl: location.href, liveChat: chat.slice(-50) };
    }

    const comments = [];
    for (const el of document.querySelectorAll("[role='comment'], ytd-comment-thread-renderer")) {
      const text = textOf(el);
      if (text.length > 2) comments.push({ text: text.slice(0, 500) });
      if (comments.length >= 30) break;
    }
    return { frameUrl: location.href, comments };
  }

  if (command === "fillReply") {
    const text = String(args?.text ?? "");
    const submit = Boolean(args?.submit);

    const deepAll = (selector, root = document) => {
      const found = [...root.querySelectorAll(selector)];
      for (const el of root.querySelectorAll("*")) {
        if (el.shadowRoot) found.push(...deepAll(selector, el.shadowRoot));
      }
      return found;
    };

    const boxes = deepAll(
      "yt-live-chat-text-input-field-renderer #input, div#input[contenteditable='true'], div[contenteditable='true'][role='textbox'], textarea",
    );
    const el = boxes.find((node) => {
      const r = node.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
    if (!el) return { ok: false, error: "No reply box in this frame.", frameUrl: location.href };

    el.focus();
    if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
      el.value = text;
      el.dispatchEvent(new Event("input", { bubbles: true }));
    } else if (el.isContentEditable) {
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(el);
      sel.removeAllRanges();
      sel.addRange(range);
      document.execCommand("insertText", false, text);
      if (!el.innerText.includes(text)) el.textContent = text;
      el.dispatchEvent(new InputEvent("input", { bubbles: true, data: text, inputType: "insertText" }));
    }

    const typed = (el.value || el.innerText || "").trim();
    if (!submit) {
      return { ok: true, submitted: false, typed, frameUrl: location.href };
    }

    el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true }));

    const buttons = deepAll("#send-button button, #send-button, button[aria-label*='Send' i]");
    const sendBtn = buttons.find((b) => b.getBoundingClientRect().width > 0) || buttons[0];
    if (sendBtn) {
      sendBtn.removeAttribute("disabled");
      sendBtn.click();
      return { ok: true, submitted: true, typed, frameUrl: location.href };
    }
    return { ok: true, submitted: false, typed, note: "Typed; Send button not found.", frameUrl: location.href };
  }

  return { ok: false, error: `Unknown command: ${command}` };
}

function mergeFrameResults(command, frames) {
  if (!frames.length) return { error: "No frame results" };

  if (command === "snapshot") {
    const best = frames.reduce((a, b) => ((a.text?.length || 0) > (b.text?.length || 0) ? a : b));
    return { url: best.frameUrl, title: best.title, text: best.text, frames: frames.length };
  }

  if (command === "extractComments" || command === "extractLiveChat") {
    const liveChat = frames.flatMap((f) => f.liveChat || []);
    if (liveChat.length) {
      return {
        url: frames.find((f) => f.liveChat?.length)?.frameUrl || frames[0].frameUrl,
        liveChat: liveChat.slice(-50),
      };
    }
    const comments = frames.flatMap((f) => f.comments || []);
    return { url: frames[0].frameUrl, comments };
  }

  if (command === "fillReply") {
    const chat = frames.find((f) => f.ok && String(f.frameUrl || "").includes("live_chat"));
    const typed = frames.find((f) => f.ok && f.typed);
    return chat || typed || frames.find((f) => f.ok) || frames[0];
  }

  return frames[0];
}

function locateChatTargets() {
  const deepAll = (selector, root = document) => {
    const found = [...root.querySelectorAll(selector)];
    for (const el of root.querySelectorAll("*")) {
      if (el.shadowRoot) found.push(...deepAll(selector, el.shadowRoot));
    }
    return found;
  };
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 8 && r.height > 8;
  };
  const box = deepAll(
    "yt-live-chat-text-input-field-renderer #input, div#input[contenteditable='true'], div[contenteditable='true'][role='textbox'], textarea",
  ).find((el) => visible(el) && (el.isContentEditable || el.tagName === "TEXTAREA"));
  if (!box) return null;
  const send =
    deepAll(
      "yt-live-chat-message-input #send-button, yt-live-chat-message-input yt-icon-button#send-button, #send-button button, yt-icon-button#send-button, #send-button, button[aria-label*='Send' i], button[aria-label*='Chat' i][aria-label*='send' i]",
    ).find(visible) || null;

  /** Element center in top-level tab viewport (required for chrome.debugger mouse events). */
  const tabCenter = (el) => {
    const r = el.getBoundingClientRect();
    let x = r.left + r.width / 2;
    let y = r.top + r.height / 2;
    let w = el.ownerDocument.defaultView;
    while (w && w !== w.top) {
      const fe = w.frameElement;
      if (!fe) break;
      const fr = fe.getBoundingClientRect();
      x += fr.left;
      y += fr.top;
      w = w.parent;
    }
    return { x, y };
  };

  return {
    frameUrl: location.href,
    input: tabCenter(box),
    send: send ? tabCenter(send) : null,
  };
}

/** Runs in live_chat iframe — press Enter + click Send on the real DOM (after trusted typing). */
function submitLiveChatFromFrame() {
  const deepAll = (selector, root = document) => {
    const found = [...root.querySelectorAll(selector)];
    for (const el of root.querySelectorAll("*")) {
      if (el.shadowRoot) found.push(...deepAll(selector, el.shadowRoot));
    }
    return found;
  };
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 8 && r.height > 8;
  };
  if (!String(location.href).includes("live_chat")) return { ok: false, skip: true };

  const box = deepAll(
    "yt-live-chat-text-input-field-renderer #input, div#input[contenteditable='true'], div[contenteditable='true'][role='textbox']",
  ).find((el) => visible(el));

  const keySteps = [];
  if (box) {
    box.focus();
    for (const type of ["keydown", "keypress", "keyup"]) {
      box.dispatchEvent(
        new KeyboardEvent(type, {
          key: "Enter",
          code: "Enter",
          keyCode: 13,
          which: 13,
          bubbles: true,
          cancelable: true,
        }),
      );
      keySteps.push(type);
    }
  }

  const sendNodes = deepAll(
    "yt-live-chat-message-input yt-icon-button#send-button, yt-live-chat-message-input #send-button, yt-icon-button#send-button, #send-button button, #send-button, button[aria-label*='Send' i]",
  ).filter(visible);

  for (const node of sendNodes) {
    const clickables = [node.querySelector("button"), node.querySelector("yt-icon-button"), node].filter(Boolean);
    for (const el of clickables) {
      el.removeAttribute?.("disabled");
      el.click?.();
    }
    return { ok: true, method: "domSend", keySteps, frameUrl: location.href };
  }

  return { ok: false, error: "send not found", keySteps, frameUrl: location.href };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function clearChatInputField(debuggee) {
  const mod = 2; // Ctrl
  const key = async (type, k, code, vk, modifiers = 0) => {
    await chrome.debugger.sendCommand(debuggee, "Input.dispatchKeyEvent", {
      type,
      key: k,
      code,
      windowsVirtualKeyCode: vk,
      nativeVirtualKeyCode: vk,
      modifiers,
    });
  };
  await key("keyDown", "Control", "ControlLeft", 17, mod);
  await key("keyDown", "a", "KeyA", 65, mod);
  await key("keyUp", "a", "KeyA", 65, mod);
  await key("keyUp", "Control", "ControlLeft", 17, 0);
  await key("keyDown", "Backspace", "Backspace", 8, 0);
  await key("keyUp", "Backspace", "Backspace", 8, 0);
}

async function trustedTypeAndSend(tabId, target, text, { insert = true } = {}) {
  const debuggee = { tabId };
  await chrome.debugger.attach(debuggee, "1.3");
  try {
    const click = async (point) => {
      await chrome.debugger.sendCommand(debuggee, "Input.dispatchMouseEvent", {
        type: "mousePressed",
        x: point.x,
        y: point.y,
        button: "left",
        clickCount: 1,
      });
      await chrome.debugger.sendCommand(debuggee, "Input.dispatchMouseEvent", {
        type: "mouseReleased",
        x: point.x,
        y: point.y,
        button: "left",
        clickCount: 1,
      });
    };
    await click(target.input);
    await sleep(200);
    if (insert && text) {
      await clearChatInputField(debuggee);
      await sleep(80);
      await chrome.debugger.sendCommand(debuggee, "Input.insertText", { text });
      await sleep(200);
      await click(target.input);
      await sleep(100);
    }
    const pressEnter = async () => {
      await chrome.debugger.sendCommand(debuggee, "Input.dispatchKeyEvent", {
        type: "keyDown",
        key: "Enter",
        code: "Enter",
        windowsVirtualKeyCode: 13,
        nativeVirtualKeyCode: 13,
      });
      await chrome.debugger.sendCommand(debuggee, "Input.dispatchKeyEvent", {
        type: "keyUp",
        key: "Enter",
        code: "Enter",
        windowsVirtualKeyCode: 13,
        nativeVirtualKeyCode: 13,
      });
    };
    await click(target.input);
    await sleep(80);
    await pressEnter();
    await sleep(120);
    if (target.send) {
      await click(target.send);
      await sleep(80);
      await click(target.send);
      await sleep(120);
    } else {
      await pressEnter();
    }
  } finally {
    try {
      await chrome.debugger.detach(debuggee);
    } catch {
      /* already detached */
    }
  }
}

async function runOnTab(tabId, message) {
  if (message?.type !== "bridge-command") {
    return { ok: false, error: "Invalid message" };
  }
  const { command, args } = message;

  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab.url?.startsWith("http")) {
      return { ok: false, error: "Cannot read this tab (only http/https pages)." };
    }

    if (command === "fillReply" && args?.submit) {
      const located = await chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
        func: locateChatTargets,
      });
      const target = located.map((r) => r.result).find((r) => r?.input && String(r.frameUrl).includes("live_chat"))
        || located.map((r) => r.result).find((r) => r?.input);
      if (!target) return { ok: false, error: "Chat input not found on this tab." };
      const body = String(args.text ?? "");
      await trustedTypeAndSend(tabId, target, body, { insert: !args.enterOnly });
      const domResults = await chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
        func: submitLiveChatFromFrame,
      });
      const domSubmit =
        domResults.map((r) => r.result).find((r) => r?.ok) ||
        domResults.map((r) => r.result).find((r) => r && !r.skip);
      await sleep(900);
      const check = await chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
        func: bridgePageCommand,
        args: ["extractLiveChat", {}],
      });
      const frames = check.map((r) => r.result).filter(Boolean);
      const chat = mergeFrameResults("extractLiveChat", frames);
      const snippet = body.slice(0, 24);
      const posted = (chat.liveChat || []).some((m) => {
        const t = String(m.text || "");
        return t.includes(body) || (snippet.length >= 12 && t.includes(snippet));
      });
      return {
        ok: true,
        result: {
          submitted: true,
          trustedInput: true,
          enterKey: true,
          posted,
          clickedSend: Boolean(target.send),
          domSubmit,
          target,
        },
      };
    }

    const injected = await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: bridgePageCommand,
      args: [command, args ?? {}],
    });

    const frames = injected.map((r) => r.result).filter(Boolean);
    return { ok: true, result: mergeFrameResults(command, frames) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function handleBridgeRequest(msg) {
  const { id, method, params } = msg;
  let result;
  let error;

  try {
    switch (method) {
      case "ping":
        result = { pong: true, at: Date.now() };
        break;
      case "tabs.list": {
        const tabs = await chrome.tabs.query({});
        result = tabs.map((t) => ({
          id: t.id,
          url: t.url,
          title: t.title,
          active: t.active,
          windowId: t.windowId,
        }));
        break;
      }
      case "page.command": {
        const tabId = params?.tabId;
        if (!tabId) throw new Error("tabId required");
        const command = params?.command;
        const args = params?.args ?? {};
        const out = await runOnTab(tabId, { type: "bridge-command", command, args });
        if (!out.ok) throw new Error(out.error);
        result = out.result;
        break;
      }
      case "activeTab.command": {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id) throw new Error("No active tab");
        const command = params?.command;
        const args = params?.args ?? {};
        const out = await runOnTab(tab.id, { type: "bridge-command", command, args });
        if (!out.ok) throw new Error(out.error);
        result = { tabId: tab.id, url: tab.url, title: tab.title, data: out.result };
        break;
      }
      default:
        throw new Error(`Unknown method: ${method}`);
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  sendToBridge({ id, type: "response", result, error });
}

connectBridge();
chrome.runtime.onStartup.addListener(connectBridge);
chrome.runtime.onInstalled.addListener(connectBridge);
chrome.alarms.create("bridge-keepalive", { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "bridge-keepalive") connectBridge();
});
chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "keepalive") connectBridge();
});
