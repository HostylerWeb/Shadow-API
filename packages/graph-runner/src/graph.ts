export type GraphStep =
  | { id: string; type: "navigate"; url: string; timeout_ms?: number }
  | { id: string; type: "fill"; field: string; selector: string; timeout_ms?: number }
  | { id: string; type: "click"; selector?: string; timeout_ms?: number }
  | {
      id: string;
      type: "wait";
      selector?: string;
      urlPattern?: string;
      loadState?: "domcontentloaded" | "networkidle";
      timeout_ms?: number;
    }
  | { id: string; type: "branch"; patterns: Array<"P1" | "P2" | "P3">; then: string; timeout_ms?: number }
  | { id: string; type: "extract"; timeout_ms?: number };

export type GraphDocument = {
  graph_version: string;
  success_enums: string[];
  steps: GraphStep[];
};

export function loadGraph(raw: unknown): GraphDocument {
  if (!raw || typeof raw !== "object") {
    throw new Error("Graph JSON must be an object");
  }
  const doc = raw as Partial<GraphDocument>;
  if (typeof doc.graph_version !== "string" || !doc.graph_version) {
    throw new Error("graph_version is required");
  }
  if (!Array.isArray(doc.steps) || doc.steps.length === 0) {
    throw new Error("steps must be a non-empty array");
  }
  return {
    graph_version: doc.graph_version,
    success_enums: doc.success_enums ?? [],
    steps: doc.steps,
  };
}
