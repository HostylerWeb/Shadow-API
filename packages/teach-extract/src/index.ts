export type {
  CompositeExtract,
  ExtractBlock,
  ExtractSpec,
  FieldGroupBlock,
  LegacyMarkedExtract,
  MarkedField,
  RepeatingBlock,
  ScalarBlock,
} from "./types.js";
export { isCompositeExtract } from "./types.js";

import type {
  CompositeExtract,
  ExtractBlock,
  ExtractSpec,
  FieldGroupBlock,
  LegacyMarkedExtract,
  RepeatingBlock,
  ScalarBlock,
} from "./types.js";

export function sanitizeSelector(selector: string): string {
  return selector
    .replace(/\.shadow-teach-hover\b/g, "")
    .replace(/\.shadow-teach-active\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeToComposite(spec: ExtractSpec): CompositeExtract {
  if (spec.kind === "composite") return spec;
  return { kind: "composite", blocks: legacyToBlocks(spec) };
}

function legacyToBlocks(legacy: LegacyMarkedExtract): ExtractBlock[] {
  if (legacy.kind === "marked_list") {
    const block: RepeatingBlock = {
      type: "list",
      key: legacy.array_key?.trim() || "items",
      row_selector: legacy.row_selector,
      fields: legacy.fields,
    };
    return [block];
  }
  if (legacy.kind === "marked_single") {
    const block: ScalarBlock = {
      type: "scalar",
      key: legacy.output_key?.trim() || "value",
      selector: legacy.selector,
    };
    return [block];
  }
  const block: FieldGroupBlock = { type: "fields", fields: legacy.fields };
  return [block];
}

export function parseExtractSpec(raw: string): ExtractSpec | null {
  if (!raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as ExtractSpec;
    if (!parsed || typeof parsed !== "object" || !("kind" in parsed)) return null;
    if (parsed.kind === "composite") {
      if (!Array.isArray(parsed.blocks)) return null;
      return parsed;
    }
    if (
      parsed.kind === "marked_list" ||
      parsed.kind === "marked_single" ||
      parsed.kind === "marked_page"
    ) {
      return parsed as LegacyMarkedExtract;
    }
    return null;
  } catch {
    return null;
  }
}

export function listArrayKeyFromSpec(spec: ExtractSpec): string {
  const composite = normalizeToComposite(spec);
  const list = composite.blocks.find((b): b is RepeatingBlock => b.type === "list");
  return list?.key?.trim() || "items";
}

export function sampleHasValues(rows: Record<string, string>[]): boolean {
  return rows.some((row) => Object.values(row).some((value) => value.trim().length > 0));
}

export function compositeReady(composite: CompositeExtract): boolean {
  if (!composite.blocks.length) return false;
  for (const block of composite.blocks) {
    if (block.type === "scalar") {
      if (!block.key.trim() || !block.selector.trim()) return false;
    }
    if (block.type === "fields") {
      if (!block.fields.length || !block.fields.some((f) => f.selector.trim())) return false;
    }
    if (block.type === "list") {
      if (!block.key.trim() || !block.row_selector.trim() || !block.fields.length) return false;
    }
  }
  return true;
}

export type DomFieldSpec = { key: string; selector: string };

function absoluteUrl(raw: string): string {
  let href = raw;
  try {
    href = new URL(raw, document.baseURI).href;
  } catch {
    return raw;
  }
  try {
    const parsed = new URL(href);
    if (parsed.pathname === "/api/browse" || parsed.pathname.endsWith("/api/browse")) {
      const nested = parsed.searchParams.get("u");
      if (nested && /^https?:/i.test(nested)) return nested;
    }
  } catch {
    /* keep resolved href */
  }
  return href;
}

function textLeaves(root: Element): Element[] {
  return Array.from(root.querySelectorAll("*")).filter((node) => {
    if (node.children.length > 0) return false;
    return (node.textContent ?? "").replace(/\s+/g, " ").trim().length > 0;
  });
}

/**
 * Image address for pictures, link address for anchors and for the trailing control
 * inside a link that also contains other labels (a card "Enter now"). Other fields stay text.
 */
export function readableElementText(el: Element): string {
  const ownText = (el.textContent ?? "").replace(/\s+/g, " ").trim();
  const img =
    el.tagName === "IMG"
      ? (el as HTMLImageElement)
      : !ownText && "querySelector" in el
        ? el.querySelector("img")
        : null;
  if (img) {
    const raw =
      img.currentSrc ||
      img.getAttribute("src") ||
      img.getAttribute("data-src") ||
      firstSrcsetUrl(img.getAttribute("srcset")) ||
      "";
    if (raw) return absoluteUrl(raw);
  }
  const linkHref = hrefForControl(el);
  if (linkHref) return linkHref;
  return ownText;
}

function hrefForControl(el: Element): string {
  const anchor = el.closest("a[href]");
  if (!anchor) return "";
  const href = anchor.getAttribute("href") || "";
  if (!href || href.startsWith("#") || href.toLowerCase().startsWith("javascript:")) return "";
  const isControl =
    el === anchor || el.tagName === "BUTTON" || el.getAttribute("role") === "button" || el.getAttribute("role") === "link";
  if (isControl && el === anchor) {
    const leaves = textLeaves(anchor);
    if (leaves.length > 1) return absoluteUrl(href);
    return "";
  }
  if (el.tagName === "BUTTON" || el.getAttribute("role") === "button" || el.getAttribute("role") === "link") {
    return absoluteUrl(href);
  }
  if (el.children.length === 0) {
    const leaves = textLeaves(anchor);
    if (leaves.length > 1 && leaves[leaves.length - 1] === el) return absoluteUrl(href);
  }
  return "";
}

function firstSrcsetUrl(srcset: string | null): string {
  if (!srcset) return "";
  const part = srcset.split(",")[0]?.trim() ?? "";
  return part.split(/\s+/)[0] ?? "";
}

export function domEvalExtractComposite(composite: CompositeExtract): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const block of composite.blocks) {
    if (block.type === "scalar") {
      const sel = sanitizeSelector(block.selector);
      const el = document.querySelector(sel);
      out[block.key] = el ? readableElementText(el) : "";
    }
    if (block.type === "fields") {
      for (const field of block.fields) {
        const sel = sanitizeSelector(field.selector);
        const el = document.querySelector(sel);
        out[field.key] = el ? readableElementText(el) : "";
      }
    }
    if (block.type === "list") {
      const rowSel = sanitizeSelector(block.row_selector);
      const fields = block.fields.map((f) => ({ key: f.key, selector: sanitizeSelector(f.selector) }));
      const rows = Array.from(document.querySelectorAll(rowSel)).slice(0, 50);
      const items: Record<string, string>[] = [];
      for (const row of rows) {
        const item: Record<string, string> = {};
        for (const field of fields) {
          const el = row.querySelector(field.selector);
          item[field.key] = el ? readableElementText(el) : "";
        }
        if (Object.values(item).some((v) => v.length > 0)) items.push(item);
      }
      out[block.key] = items;
    }
  }
  return out;
}

export function domEvalRowCount(rowSelector: string): number {
  const rowSel = sanitizeSelector(rowSelector);
  return document.querySelectorAll(rowSel).length;
}

export function outputSchemaFromSpec(spec: ExtractSpec, scalarFallback: string): Record<string, unknown> {
  const composite = normalizeToComposite(spec);
  const schema: Record<string, unknown> = {};
  for (const block of composite.blocks) {
    if (block.type === "scalar") {
      schema[block.key] = { type: "string" };
    }
    if (block.type === "fields") {
      for (const field of block.fields) {
        schema[field.key] = { type: "string" };
      }
    }
    if (block.type === "list") {
      schema[block.key] = {
        type: "array",
        items: Object.fromEntries(block.fields.map((f) => [f.key, { type: "string" }])),
      };
    }
  }
  if (!Object.keys(schema).length) {
    return { [scalarFallback]: { type: "string" } };
  }
  return schema;
}

export function primaryOutputName(spec: ExtractSpec, fallback: string): string {
  const composite = normalizeToComposite(spec);
  const list = composite.blocks.find((b): b is RepeatingBlock => b.type === "list");
  if (list) return list.key;
  const scalar = composite.blocks.find((b): b is ScalarBlock => b.type === "scalar");
  if (scalar) return scalar.key;
  return fallback;
}

/** Playwright page.evaluate callback — keep in sync with domEvalExtractComposite */
export async function evaluateExtractComposite(
  page: {
    evaluate: (
      fn: (arg: { composite: CompositeExtract; maxRows: number }) => Record<string, unknown>,
      arg: { composite: CompositeExtract; maxRows: number },
    ) => Promise<Record<string, unknown>>;
  },
  composite: CompositeExtract,
  maxRows = 50,
): Promise<Record<string, unknown>> {
  const limit = Math.min(500, Math.max(1, Math.floor(maxRows) || 50));
  return page.evaluate(
    ({ composite: c, maxRows: rowLimit }) => {
      function sanitize(selector: string): string {
        return selector
          .replace(/\.shadow-teach-hover\b/g, "")
          .replace(/\.shadow-teach-active\b/g, "")
          .replace(/\s+/g, " ")
          .trim();
      }
      function publicUrl(raw: string): string {
        let href = raw;
        try {
          href = new URL(raw, document.baseURI).href;
        } catch {
          return raw;
        }
        try {
          const parsed = new URL(href);
          if (parsed.pathname === "/api/browse" || parsed.pathname.endsWith("/api/browse")) {
            const nested = parsed.searchParams.get("u");
            if (nested && /^https?:/i.test(nested)) return nested;
          }
        } catch {
          /* keep resolved href */
        }
        return href;
      }
      function readEl(el: Element): string {
        const ownText = (el.textContent ?? "").replace(/\s+/g, " ").trim();
        const img = el.tagName === "IMG" ? (el as HTMLImageElement) : !ownText ? el.querySelector("img") : null;
        if (img) {
          const srcset = img.getAttribute("srcset");
          const fromSet = srcset ? (srcset.split(",")[0] ?? "").trim().split(/\s+/)[0] ?? "" : "";
          const raw = img.currentSrc || img.getAttribute("src") || img.getAttribute("data-src") || fromSet || "";
          if (raw) return publicUrl(raw);
        }
        const anchor = el.closest("a[href]");
        if (anchor) {
          const href = anchor.getAttribute("href") || "";
          const usable = href && !href.startsWith("#") && !href.toLowerCase().startsWith("javascript:");
          if (usable) {
            const leaves = Array.from(anchor.querySelectorAll("*")).filter(
              (node) => node.children.length === 0 && (node.textContent ?? "").replace(/\s+/g, " ").trim().length > 0,
            );
            const abs = () => publicUrl(href);
            if (el.tagName === "BUTTON" || el.getAttribute("role") === "button" || el.getAttribute("role") === "link") return abs();
            if (el === anchor && leaves.length > 1) return abs();
            if (el.children.length === 0 && leaves.length > 1 && leaves[leaves.length - 1] === el) return abs();
          }
        }
        return ownText;
      }
      const out: Record<string, unknown> = {};
      for (const block of c.blocks) {
        if (block.type === "scalar") {
          const el = document.querySelector(sanitize(block.selector));
          out[block.key] = el ? readEl(el) : "";
        }
        if (block.type === "fields") {
          for (const field of block.fields) {
            const el = document.querySelector(sanitize(field.selector));
            out[field.key] = el ? readEl(el) : "";
          }
        }
        if (block.type === "list") {
          const rowSel = sanitize(block.row_selector);
          const fields = block.fields.map((f) => ({ key: f.key, selector: sanitize(f.selector) }));
          const rows = Array.from(document.querySelectorAll(rowSel)).slice(0, rowLimit);
          const items: Record<string, string>[] = [];
          for (const row of rows) {
            const item: Record<string, string> = {};
            for (const field of fields) {
              const el = row.querySelector(field.selector);
              item[field.key] = el ? readEl(el) : "";
            }
            if (Object.values(item).some((v) => v.length > 0)) items.push(item);
          }
          out[block.key] = items;
        }
      }
      return out;
    },
    { composite, maxRows: limit },
  );
}

export function extractHasNonEmptyOutput(data: Record<string, unknown>): boolean {
  for (const value of Object.values(data)) {
    if (typeof value === "string" && value.trim()) return true;
    if (Array.isArray(value) && value.length > 0) return true;
  }
  return false;
}
