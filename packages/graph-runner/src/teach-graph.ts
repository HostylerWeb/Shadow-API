import type { NavigationPattern } from "./runner.js";
import type { GraphDocument, GraphStep } from "./graph.js";
import { STUDIO_GRAPH_VERSION } from "./studio.js";

export type TeachControl = "text" | "select" | "checkbox" | "click";

export type TeachFormField = {
  key: string;
  selector: string;
  control?: TeachControl;
  sample?: string;
};

export type TeachClick = { selector: string; label?: string };

/** Ordered recipe. Field steps look up `formFields` by key. */
export type TeachAction =
  | { type: "field"; key: string }
  | { type: "click"; selector: string; label?: string };

export type TeachStage = {
  url: string;
  fields: TeachFormField[];
  clickSelector?: string;
  clicks?: TeachClick[];
  /** When set, this order wins over fields-then-clicks. */
  actions?: TeachAction[];
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
  actions?: TeachAction[];
}): GraphDocument {
  const same = sameTeachPage(input.startUrl, input.resultUrl);
  const interactive = hasTeachInteractions(input);

  if ((input.kind === "read" || same) && !interactive) {
    return document([
      { id: "open", type: "navigate", url: input.startUrl },
      ...(input.waitSelector
        ? [{ id: "ready", type: "wait" as const, selector: input.waitSelector, timeout_ms: 15_000 }]
        : []),
      { id: "extract", type: "extract" },
    ]);
  }

  const useStages =
    Boolean(input.stages && input.stages.length > 1) ||
    Boolean(input.stages && input.stages.length === 1 && !(input.actions && input.actions.length));
  if (useStages && input.stages) {
    return document(compileStages({ ...input, stages: input.stages }));
  }

  const steps: GraphStep[] = [
    { id: "open", type: "navigate", url: input.startUrl },
    ...recipeSteps(input.formFields, input.actions, input.submitSelector, "step"),
  ];
  if (same) {
    if (input.waitSelector) {
      steps.push({ id: "ready", type: "wait", selector: input.waitSelector, timeout_ms: 15_000 });
    }
    steps.push({ id: "extract", type: "extract" });
    return document(steps);
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
  return document(steps);
}

export function sameTeachPage(a: string, b: string): boolean {
  return teachPageKey(a) === teachPageKey(b);
}

export function teachPageKey(url: string): string {
  try {
    const parsed = new URL(url);
    let path = parsed.pathname;
    if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
    return `${parsed.origin}${path}${parsed.search}`;
  } catch {
    return url.trim();
  }
}

function document(steps: GraphStep[]): GraphDocument {
  return {
    graph_version: STUDIO_GRAPH_VERSION,
    success_enums: ["OK"],
    steps,
  };
}

function hasTeachInteractions(input: {
  formFields: TeachFormField[];
  submitSelector?: string;
  stages?: TeachStage[];
  actions?: TeachAction[];
}): boolean {
  if (input.actions && input.actions.length > 0) return true;
  if (input.submitSelector?.trim()) return true;
  if (input.formFields.some((field) => field.selector.trim())) return true;
  return Boolean(
    input.stages?.some(
      (stage) =>
        stage.fields.some((field) => field.selector.trim()) ||
        Boolean(stage.clickSelector?.trim()) ||
        Boolean(stage.clicks?.some((click) => click.selector.trim())) ||
        Boolean(stage.actions?.length),
    ),
  );
}

function compileStages(input: {
  resultUrl: string;
  formFields: TeachFormField[];
  waitSelector?: string;
  stages: TeachStage[];
}): GraphStep[] {
  const steps: GraphStep[] = [];
  let lastKey = "";
  input.stages.forEach((stage, index) => {
    const key = teachPageKey(stage.url);
    if (!lastKey || key !== lastKey) {
      steps.push({ id: `open-${index}`, type: "navigate", url: stage.url });
      lastKey = key;
    }
    const clicks: TeachClick[] = stage.clicks?.length
      ? stage.clicks
      : stage.clickSelector
        ? [{ selector: stage.clickSelector }]
        : [];
    const actions: TeachAction[] | undefined = stage.actions?.length
      ? stage.actions
      : [
          ...stage.fields.filter((field) => field.control !== "click").map((field) => ({ type: "field" as const, key: field.key })),
          ...stage.fields.filter((field) => field.control === "click").map((field) => ({ type: "click" as const, selector: field.selector })),
          ...clicks.map((click) => ({ type: "click" as const, selector: click.selector, label: click.label })),
        ];
    steps.push(...recipeSteps(stage.fields, actions, undefined, `stage-${index}`));
  });
  const resultKey = teachPageKey(input.resultUrl);
  if (resultKey !== lastKey) {
    steps.push({ id: "result", type: "navigate", url: input.resultUrl });
  } else if (input.waitSelector) {
    steps.push({ id: "ready", type: "wait", selector: input.waitSelector, timeout_ms: 15_000 });
  }
  steps.push({ id: "extract", type: "extract" });
  return steps;
}

function recipeSteps(
  fields: TeachFormField[],
  actions: TeachAction[] | undefined,
  submitSelector: string | undefined,
  idPrefix: string,
): GraphStep[] {
  const steps: GraphStep[] = [];
  if (actions && actions.length > 0) {
    const byKey = new Map(fields.map((field) => [field.key, field]));
    actions.forEach((action, index) => {
      if (action.type === "click") {
        if (!action.selector.trim()) return;
        steps.push({ id: `${idPrefix}-click-${index}`, type: "click", selector: action.selector });
        return;
      }
      const field = byKey.get(action.key);
      if (!field?.selector.trim() || field.control === "click") return;
      steps.push(fieldStep(field, `${idPrefix}-${index}-${field.key}`));
    });
    return steps;
  }
  fields.forEach((field, index) => {
    if (!field.selector.trim()) return;
    steps.push(fieldStep(field, `${idPrefix}-${index}-${field.key || index}`));
  });
  if (submitSelector?.trim()) {
    steps.push({ id: `${idPrefix}-submit`, type: "click", selector: submitSelector });
  }
  return steps;
}

function fieldStep(field: TeachFormField, id: string): GraphStep {
  const control = field.control ?? "text";
  const sample = field.sample;
  if (control === "click") return { id, type: "click", selector: field.selector };
  if (control === "select") return { id, type: "select", field: field.key, selector: field.selector, sample };
  if (control === "checkbox") return { id, type: "check", field: field.key, selector: field.selector, sample };
  return { id, type: "fill", field: field.key, selector: field.selector, sample };
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
