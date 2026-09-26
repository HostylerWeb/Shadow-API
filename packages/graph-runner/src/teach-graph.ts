import type { NavigationPattern } from "./runner.js";
import type { GraphDocument } from "./graph.js";
import { STUDIO_GRAPH_VERSION } from "./studio.js";

export type TeachFormField = { key: string; selector: string };

export type TeachStage = {
  url: string;
  fields: TeachFormField[];
  clickSelector?: string;
};

export function compileTeachGraph(input: {
  startUrl: string;
  resultUrl: string;
  kind: "read" | "lookup";
  pattern: NavigationPattern;
  formFields: TeachFormField[];
  submitSelector?: string;
  waitSelector?: string;
  stages?: TeachStage[];
}): GraphDocument {
  if (input.kind === "read" || input.startUrl === input.resultUrl) {
    return {
      graph_version: STUDIO_GRAPH_VERSION,
      success_enums: ["OK"],
      steps: [
        { id: "open", type: "navigate", url: input.startUrl },
        ...(input.waitSelector
          ? [{ id: "ready", type: "wait" as const, selector: input.waitSelector, timeout_ms: 15_000 }]
          : []),
        { id: "extract", type: "extract" },
      ],
    };
  }

  if (input.stages && input.stages.length > 0) {
    const steps: GraphDocument["steps"] = [];
    input.stages.forEach((stage, index) => {
      steps.push({ id: `open-${index}`, type: "navigate", url: stage.url });
      for (const field of stage.fields) {
        steps.push({
          id: `fill-${index}-${field.key}`,
          type: "fill",
          field: field.key,
          selector: field.selector,
        });
      }
      if (stage.clickSelector) {
        steps.push({ id: `click-${index}`, type: "click", selector: stage.clickSelector });
      }
    });
    steps.push({ id: "result", type: "navigate", url: input.resultUrl });
    steps.push({ id: "extract", type: "extract" });
    return {
      graph_version: STUDIO_GRAPH_VERSION,
      success_enums: ["OK"],
      steps,
    };
  }

  const steps: GraphDocument["steps"] = [{ id: "open", type: "navigate", url: input.startUrl }];
  for (const field of input.formFields) {
    steps.push({
      id: `fill-${field.key}`,
      type: "fill",
      field: field.key,
      selector: field.selector,
    });
  }
  if (input.submitSelector) {
    steps.push({ id: "submit", type: "click", selector: input.submitSelector });
  }
  if (input.pattern === "P1") {
    steps.push({
      id: "ready",
      type: "wait",
      selector: input.waitSelector,
      loadState: "domcontentloaded",
      timeout_ms: 15_000,
    });
  } else {
    steps.push({ id: "result", type: "navigate", url: input.resultUrl });
    steps.push({ id: "after", type: "branch", patterns: [input.pattern], then: "extract" });
  }
  steps.push({ id: "extract", type: "extract" });
  return {
    graph_version: STUDIO_GRAPH_VERSION,
    success_enums: ["OK"],
    steps,
  };
}

export function waitSelectorFromExtract(extract: unknown): string | undefined {
  if (!extract || typeof extract !== "object") return undefined;
  const kind = (extract as { kind?: string }).kind;
  if (kind === "marked_list") {
    const row = (extract as { row_selector?: string }).row_selector;
    return row?.trim() || undefined;
  }
  if (kind === "composite") {
    const blocks = (extract as { blocks?: Array<{ type?: string; row_selector?: string; selector?: string; fields?: Array<{ selector: string }> }> }).blocks;
    if (!Array.isArray(blocks)) return undefined;
    for (const block of blocks) {
      if (block.type === "list" && block.row_selector?.trim()) return block.row_selector.trim();
      if (block.type === "scalar" && block.selector?.trim()) return block.selector.trim();
      if (block.type === "fields" && block.fields?.[0]?.selector?.trim()) return block.fields[0].selector.trim();
    }
  }
  if (kind === "marked_page") {
    const fields = (extract as { fields?: Array<{ selector: string }> }).fields;
    return fields?.[0]?.selector?.trim() || undefined;
  }
  if (kind === "marked_single") {
    return (extract as { selector?: string }).selector?.trim() || undefined;
  }
  return undefined;
}
