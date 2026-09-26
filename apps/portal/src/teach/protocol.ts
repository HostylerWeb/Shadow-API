export type PageIntent = "start" | "action" | "result" | "skip";

export type MarkedField = { key: string; selector: string };

/** UI state for one mapped column; stripped to MarkedField on publish */
export type TeachField = {
  id: string;
  key: string;
  selector: string;
  sampleText?: string;
  elementTag?: string;
};

export type PickElementMeta = {
  tag: string;
  kind: "input" | "repeating" | "container" | "element";
  textLength: number;
  inputCount: number;
  matchingRows: number;
};

export type PickPayload = {
  selector: string;
  relativeSelector: string;
  text: string;
  meta: PickElementMeta;
};

export type MarkedPageExtract = {
  kind: "marked_page";
  fields: MarkedField[];
};

export type MarkedListExtract = {
  kind: "marked_list";
  row_selector: string;
  fields: MarkedField[];
};

export type MarkedSingleExtract = {
  kind: "marked_single";
  selector: string;
  output_key?: string;
};

import type { CompositeExtract } from "@shadowapi/teach-extract";

export type { CompositeExtract };

export type MarkedExtract = MarkedListExtract | MarkedSingleExtract | MarkedPageExtract | CompositeExtract;

export type ShadowNavigateMessage = { type: "shadow:navigate"; url: string };

export type ShadowPickedMessage = {
  type: "shadow:teach:picked";
  selector: string;
  relativeSelector: string;
  text: string;
  meta: PickElementMeta;
};

export type ShadowSampleObjectMessage = {
  type: "shadow:teach:sampleObject";
  requestId: string;
  object: Record<string, string> | null;
  error?: string;
};

export type ShadowSampleResultMessage = {
  type: "shadow:teach:sampleResult";
  requestId: string;
  results: Record<string, string>[] | null;
  error?: string;
};

export type ShadowSampleSingleMessage = {
  type: "shadow:teach:sampleSingle";
  requestId: string;
  value: string | null;
  error?: string;
};

export type ShadowRowCountMessage = {
  type: "shadow:teach:rowCount";
  requestId: string;
  count: number;
  error?: string;
};

export type ShadowFromFrame =
  | ShadowNavigateMessage
  | ShadowPickedMessage
  | ShadowSampleResultMessage
  | ShadowSampleSingleMessage
  | ShadowRowCountMessage
  | ShadowSampleObjectMessage
  | ShadowRecordedMessage;

export type ShadowRecordedMessage = {
  type: "shadow:teach:recorded";
  action: "fill" | "click";
  selector: string;
  value: string;
  text: string;
};

export type ShadowTeachModeCommand = {
  type: "shadow:teach:mode";
  mode: "off" | "pickRow" | "pickField" | "record";
  rowSelector?: string;
};

export type ShadowSampleCommand = {
  type: "shadow:teach:sample";
  requestId: string;
  spec: MarkedExtract;
};

export type ShadowRowCountCommand = {
  type: "shadow:teach:rowCount";
  requestId: string;
  row_selector: string;
};

export type ShadowPortalOriginCommand = { type: "shadow:portal:origin"; origin: string };

export type ShadowHighlightCommand = {
  type: "shadow:teach:highlight";
  row_selector?: string;
  fields: Array<{ key: string; selector: string }>;
};

export type ShadowToFrame =
  | ShadowTeachModeCommand
  | ShadowSampleCommand
  | ShadowRowCountCommand
  | ShadowPortalOriginCommand
  | ShadowHighlightCommand;

export function isShadowFromFrame(data: unknown): data is ShadowFromFrame {
  if (!data || typeof data !== "object") return false;
  const type = (data as { type?: string }).type;
  return (
    type === "shadow:navigate" ||
    type === "shadow:teach:picked" ||
    type === "shadow:teach:sampleResult" ||
    type === "shadow:teach:sampleSingle" ||
    type === "shadow:teach:rowCount" ||
    type === "shadow:teach:sampleObject" ||
    type === "shadow:teach:recorded"
  );
}

export function normalizePageKey(url: string): string {
  try {
    const parsed = new URL(url);
    let path = parsed.pathname;
    if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
    return `${parsed.origin}${path}${parsed.search}`;
  } catch {
    return url.trim();
  }
}

export function pageKeysMatch(a: string, b: string): boolean {
  return normalizePageKey(a) === normalizePageKey(b);
}

export function defaultFieldKeys(): string[] {
  return ["field_1", "field_2", "field_3"];
}
