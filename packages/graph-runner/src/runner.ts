import type { GraphDocument, GraphStep } from "./graph.js";

export type NavigationPattern = "P1" | "P2" | "P3";

export type FixtureReplay = {
  html: string;
  har: Array<{ url: string; status: number; body?: string }>;
  urlBefore: string;
  urlAfter: string;
  /** Business enum read from the page or HAR, when the fixture recorded one. */
  businessEnum?: string;
  /** Bad tracking number or similar — not a graph failure. */
  userInputError?: boolean;
  /** Unexpected DOM or network failure. */
  unexpected?: boolean;
  /** Step exceeded timeout_ms. */
  timedOut?: boolean;
};

export type RunResult = {
  ok: boolean;
  graphVersion: string;
  pattern?: NavigationPattern;
  businessEnum?: string;
  failureCode?: "GRAPH_STEP_FAILED" | "VALIDATION_ERROR";
  outputs: Record<string, unknown>;
};

export function detectNavigationPattern(urlBefore: string, urlAfter: string): NavigationPattern {
  const before = new URL(urlBefore);
  const after = new URL(urlAfter);
  const beforeNoHash = `${before.origin}${before.pathname}${before.search}`;
  const afterNoHash = `${after.origin}${after.pathname}${after.search}`;
  if (beforeNoHash === afterNoHash) return "P1";
  if (before.pathname === after.pathname) return "P2";
  return "P3";
}

function stepById(steps: GraphStep[], id: string): GraphStep {
  const step = steps.find((item) => item.id === id);
  if (!step) throw new Error(`Missing step ${id}`);
  return step;
}

export function runGraph(graph: GraphDocument, fixture: FixtureReplay): RunResult {
  const base: RunResult = {
    ok: false,
    graphVersion: graph.graph_version,
    outputs: { html_length: fixture.html.length, har_entries: fixture.har.length },
  };

  if (fixture.userInputError) {
    return { ...base, failureCode: "VALIDATION_ERROR", businessEnum: fixture.businessEnum };
  }

  let index = 0;
  while (index < graph.steps.length) {
    const step = graph.steps[index];
    if (fixture.timedOut && (step.timeout_ms ?? 30_000) >= 0) {
      return { ...base, failureCode: "GRAPH_STEP_FAILED" };
    }

    if (step.type === "branch") {
      if (fixture.unexpected) {
        return { ...base, failureCode: "GRAPH_STEP_FAILED" };
      }
      const pattern = detectNavigationPattern(fixture.urlBefore, fixture.urlAfter);
      if (!step.patterns.includes(pattern)) {
        return { ...base, pattern, failureCode: "GRAPH_STEP_FAILED" };
      }
      const next = stepById(graph.steps, step.then);
      index = graph.steps.indexOf(next);
      base.pattern = pattern;
      continue;
    }

    if (step.type === "extract") {
      const businessEnum = fixture.businessEnum;
      const success = businessEnum != null && graph.success_enums.includes(businessEnum);
      if (fixture.unexpected || !success) {
        return { ...base, pattern: base.pattern, businessEnum, failureCode: "GRAPH_STEP_FAILED" };
      }
      return {
        ...base,
        ok: true,
        pattern: base.pattern,
        businessEnum,
        outputs: { ...base.outputs, status: businessEnum },
      };
    }

    index += 1;
  }

  return { ...base, failureCode: "GRAPH_STEP_FAILED" };
}
