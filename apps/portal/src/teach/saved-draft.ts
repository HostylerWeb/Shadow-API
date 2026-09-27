import type { ExtractBlock, ExtractSpec } from "@shadowapi/teach-extract";
import { newTeachField } from "./mapping";
import { pageKeysMatch, type TeachControl, type TeachField } from "./protocol";
import { applyPageIntent, emptyTeachSession, type TeachSessionState } from "./session";

export type SavedTeachDraft = {
  connectorId: string;
  session: TeachSessionState;
  resultShape: "list" | "single" | "object";
  listArrayKey: string;
  outputName: string;
  rowSelector: string;
  fields: TeachField[];
  extraBlocks: ExtractBlock[];
  formFields: TeachField[];
  actions: Array<{ type: "field"; key: string } | { type: "click"; selector: string; label?: string }>;
  submitSelector: string;
  requiresSession: boolean;
  stages: Array<{ url: string; fields: Array<{ key: string; selector: string }>; clickSelector?: string }>;
};

function isControl(value: unknown): value is TeachControl {
  return value === "text" || value === "select" || value === "checkbox" || value === "click";
}

function asActions(raw: unknown): SavedTeachDraft["actions"] {
  if (!Array.isArray(raw)) return [];
  const actions: SavedTeachDraft["actions"] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const type = "type" in item ? item.type : "";
    if (type === "field" && "key" in item && typeof item.key === "string") {
      actions.push({ type: "field", key: item.key });
      continue;
    }
    if (type === "click" && "selector" in item && typeof item.selector === "string") {
      const label = "label" in item && typeof item.label === "string" ? item.label : undefined;
      actions.push({ type: "click", selector: item.selector, label });
    }
  }
  return actions;
}

function asFields(raw: unknown): TeachField[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const key = "key" in item && typeof item.key === "string" ? item.key : "";
    const selector = "selector" in item && typeof item.selector === "string" ? item.selector : "";
    if (!key || !selector) return [];
    const control = "control" in item && isControl(item.control) ? item.control : undefined;
    return [newTeachField({ key, selector, control })];
  });
}

export function draftFromManifest(connectorId: string, manifest: Record<string, unknown>): SavedTeachDraft | null {
  const startUrl = typeof manifest.start_url === "string" ? manifest.start_url : "";
  if (!startUrl) return null;
  const resultUrl = typeof manifest.result_url === "string" && manifest.result_url ? manifest.result_url : startUrl;
  let session = applyPageIntent(emptyTeachSession(startUrl), startUrl, "start");
  session = applyPageIntent(session, resultUrl, "result");
  const pattern = manifest.pattern;
  if (pattern === "P1" || pattern === "P2" || pattern === "P3") session = { ...session, pattern };

  const extract = manifest.extract as ExtractSpec | undefined;
  let resultShape: SavedTeachDraft["resultShape"] = "list";
  let listArrayKey = typeof manifest.output_name === "string" ? manifest.output_name : "items";
  let outputName = listArrayKey;
  let rowSelector = "";
  let fields: TeachField[] = [];
  let extraBlocks: ExtractBlock[] = [];

  if (extract?.kind === "composite" && Array.isArray(extract.blocks)) {
    const [primary, ...rest] = extract.blocks;
    extraBlocks = rest;
    if (primary?.type === "list") {
      resultShape = "list";
      listArrayKey = primary.key || listArrayKey;
      rowSelector = primary.row_selector;
      fields = asFields(primary.fields);
    } else if (primary?.type === "fields") {
      resultShape = "object";
      fields = asFields(primary.fields);
    } else if (primary?.type === "scalar") {
      resultShape = "single";
      outputName = primary.key || outputName;
      fields = primary.selector ? [newTeachField({ key: outputName, selector: primary.selector })] : [];
    } else {
      extraBlocks = extract.blocks;
    }
  } else if (extract?.kind === "marked_list") {
    resultShape = "list";
    listArrayKey = extract.array_key || listArrayKey;
    rowSelector = extract.row_selector;
    fields = asFields(extract.fields);
  } else if (extract?.kind === "marked_page") {
    resultShape = "object";
    fields = asFields(extract.fields);
  } else if (extract?.kind === "marked_single") {
    resultShape = "single";
    outputName = extract.output_key || outputName;
    fields = extract.selector ? [newTeachField({ key: outputName, selector: extract.selector })] : [];
  }

  const stages = Array.isArray(manifest.stages) ? (manifest.stages as SavedTeachDraft["stages"]) : [];
  const formFields = asFields(manifest.form_fields);
  if (manifest.in_place === true || (formFields.length > 0 && pageKeysMatch(startUrl, resultUrl))) {
    session = { ...session, inPlace: true, actionUrl: session.actionUrl || startUrl, pattern: "P1" };
  }
  return {
    connectorId,
    session,
    resultShape,
    listArrayKey,
    outputName,
    rowSelector,
    fields,
    extraBlocks,
    formFields,
    actions: asActions(manifest.actions),
    submitSelector: typeof manifest.submit_selector === "string" ? manifest.submit_selector : "",
    requiresSession: manifest.requires_session === true,
    stages,
  };
}
