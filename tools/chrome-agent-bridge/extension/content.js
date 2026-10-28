const COMMENT_SELECTORS = [
  "[role='comment']",
  "article[data-testid*='comment']",
  "ytd-comment-thread-renderer",
  ".comment",
  ".comments-item",
  "[class*='comment-thread']",
  "[id*='comment']",
];

function textOf(el) {
  return (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
}

function extractComments() {
  const seen = new Set();
  const items = [];

  for (const sel of COMMENT_SELECTORS) {
    for (const el of document.querySelectorAll(sel)) {
      if (seen.has(el)) continue;
      seen.add(el);
      const text = textOf(el);
      if (!text || text.length < 2) continue;
      items.push({
        text: text.slice(0, 2000),
        selectorHint: sel,
        path: cssPath(el),
      });
      if (items.length >= 40) break;
    }
    if (items.length >= 40) break;
  }

  return {
    url: location.href,
    title: document.title,
    comments: items,
  };
}

function cssPath(el) {
  if (!el || el.nodeType !== 1) return "";
  const parts = [];
  let node = el;
  for (let depth = 0; node && depth < 6; depth += 1) {
    let part = node.tagName.toLowerCase();
    if (node.id) {
      part += `#${node.id}`;
      parts.unshift(part);
      break;
    }
    const parent = node.parentElement;
    if (parent) {
      const siblings = [...parent.children].filter((c) => c.tagName === node.tagName);
      if (siblings.length > 1) {
        const idx = siblings.indexOf(node) + 1;
        part += `:nth-of-type(${idx})`;
      }
    }
    parts.unshift(part);
    node = parent;
  }
  return parts.join(" > ");
}

function findReplyTarget() {
  const candidates = [
    "textarea[placeholder*='reply' i]",
    "textarea[placeholder*='comment' i]",
    "div[contenteditable='true'][role='textbox']",
    "div[contenteditable='true']",
    "#contenteditable-root",
    "textarea",
  ];
  for (const sel of candidates) {
    const el = document.querySelector(sel);
    if (el && isVisible(el)) return el;
  }
  return null;
}

function isVisible(el) {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

function fillReply(text) {
  const el = findReplyTarget();
  if (!el) return { ok: false, error: "No reply box found on this page." };

  el.focus();
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
    el.value = text;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return { ok: true, mode: "textarea", length: text.length };
  }

  if (el.isContentEditable) {
    el.textContent = text;
    el.dispatchEvent(new InputEvent("input", { bubbles: true, data: text, inputType: "insertText" }));
    return { ok: true, mode: "contenteditable", length: text.length };
  }

  return { ok: false, error: "Reply target not editable." };
}

/** TradingView: prefer chart container + legend rows (OHLC + indicator values). */
function tradingViewChartSnapshot() {
  const chunks = [];
  chunks.push(document.title);
  chunks.push(location.href);

  const selectors = [
    '[data-name="legend-source-item"]',
    '[class*="pane-legend"]',
    '[class*="legendSourceWrapper"]',
    '[class*="chart-markup-table"]',
    '[class*="chart-gui-wrapper"]',
    '[class*="chart-container"]',
    '[data-name="legend"]',
  ];
  const seen = new Set();
  for (const sel of selectors) {
    for (const el of document.querySelectorAll(sel)) {
      const t = textOf(el);
      if (!t || t.length < 8 || seen.has(t)) continue;
      seen.add(t);
      chunks.push(t);
    }
  }

  const main = document.querySelector('[class*="chart-container"]') || document.querySelector("main") || document.body;
  chunks.push(textOf(main));

  const text = chunks.join("\n").replace(/\n{3,}/g, "\n\n").slice(0, 16000);
  return {
    ok: true,
    url: location.href,
    title: document.title,
    text,
    mode: "tradingviewChart",
  };
}

function pageSnapshot() {
  if (/tradingview\.com/i.test(location.hostname)) {
    return tradingViewChartSnapshot();
  }
  const main = document.querySelector("main") || document.body;
  const text = textOf(main).slice(0, 12000);
  return {
    url: location.href,
    title: document.title,
    text,
    mode: "page",
  };
}

if (!location.hostname.endsWith("youtube.com")) {
  /* keepalive only on real pages, not the local bridge health tab */
} else {
  setInterval(() => {
    if (!chrome.runtime?.id) return;
    chrome.runtime.sendMessage({ type: "keepalive" }, () => void chrome.runtime.lastError);
  }, 20000);
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "bridge-command") return;

  const { command, args } = message;
  let result;

  switch (command) {
    case "snapshot":
      result = pageSnapshot();
      break;
    case "tradingviewChart":
      result = /tradingview\.com/i.test(location.hostname)
        ? tradingViewChartSnapshot()
        : { ok: false, error: "Not a TradingView tab", url: location.href };
      break;
    case "extractComments":
      result = extractComments();
      break;
    case "fillReply":
      result = fillReply(String(args?.text ?? ""));
      break;
    default:
      result = { ok: false, error: `Unknown command: ${command}` };
  }

  sendResponse(result);
  return true;
});
