import type { ExtractBlock, ExtractSpec } from "@shadowapi/teach-extract";
import { newTeachField } from "./mapping";
import type { TeachField } from "./protocol";
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
  submitSelector: string;
  requiresSession: boolean;
  stages: Array<{ url: string; fields: Array<{ key: string; selector: string }>; clickSelector?: string }>;
};

function asFields(raw: unknown): TeachField[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const key = "key" in item && typeof item.key === "string" ? item.key : "";
    const selector = "selector" in item && typeof item.selector === "string" ? item.selector : "";
    if (!key || !selector) return [];
    return [newTeachField({ key, selector })];
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
  return {
    connectorId,
    session,
    resultShape,
    listArrayKey,
    outputName,
    rowSelector,
    fields,
    extraBlocks,
    formFields: asFields(manifest.form_fields),
    submitSelector: typeof manifest.submit_selector === "string" ? manifest.submit_selector : "",
    requiresSession: manifest.requires_session === true,
    stages,
  };
}
