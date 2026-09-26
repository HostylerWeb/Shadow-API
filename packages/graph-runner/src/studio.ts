import type { GraphDocument } from "./graph.js";
import { runGraph, type FixtureReplay, type NavigationPattern, type RunResult } from "./runner.js";

export const STUDIO_GRAPH_VERSION = "v1.0.0-g1";
export const STUDIO_CONNECTOR_ID = "studio_tracking";

export function compileStudioGraph(input: {
  url1: string;
  url2: string;
  pattern: NavigationPattern;
  inputName: string;
  outputName: string;
  kind?: "read" | "lookup";
}): GraphDocument {
  if (input.kind === "read" || input.url1 === input.url2) {
    return {
      graph_version: STUDIO_GRAPH_VERSION,
      success_enums: ["IN_TRANSIT"],
      steps: [
        { id: "open", type: "navigate", url: input.url1 },
        { id: "after", type: "branch", patterns: ["P1"], then: "extract" },
        { id: "extract", type: "extract" },
      ],
    };
  }
  return {
    graph_version: STUDIO_GRAPH_VERSION,
    success_enums: ["IN_TRANSIT"],
    steps: [
      { id: "open", type: "navigate", url: input.url1 },
      { id: "fill", type: "fill", field: input.inputName, selector: `[data-shadow-input="${input.inputName}"]` },
      { id: "next", type: "navigate", url: input.url2 },
      { id: "after", type: "branch", patterns: [input.pattern], then: "extract" },
      { id: "extract", type: "extract" },
    ],
  };
}

export function studioFixture(pattern: NavigationPattern): FixtureReplay {
  const before = "https://staging.local/tracking";
  const after =
    pattern === "P1" ? before : pattern === "P2" ? `${before}?tracking=123` : "https://staging.local/result/123";
  return {
    html: "<p>IN_TRANSIT</p>",
    har: [],
    urlBefore: before,
    urlAfter: after,
    businessEnum: "IN_TRANSIT",
  };
}

export function replayStudioGraph(graph: GraphDocument, pattern: NavigationPattern): RunResult {
  return runGraph(graph, studioFixture(pattern));
}
