export type MarkedField = { key: string; selector: string };

export type LegacyMarkedExtract =
  | { kind: "marked_list"; row_selector: string; fields: MarkedField[]; array_key?: string }
  | { kind: "marked_single"; selector: string; output_key?: string }
  | { kind: "marked_page"; fields: MarkedField[] };

export type ScalarBlock = { type: "scalar"; key: string; selector: string };
export type FieldGroupBlock = { type: "fields"; fields: MarkedField[] };
export type RepeatingBlock = { type: "list"; key: string; row_selector: string; fields: MarkedField[] };

export type ExtractBlock = ScalarBlock | FieldGroupBlock | RepeatingBlock;

export type CompositeExtract = { kind: "composite"; blocks: ExtractBlock[] };

export type ExtractSpec = LegacyMarkedExtract | CompositeExtract;

export function isCompositeExtract(spec: ExtractSpec): spec is CompositeExtract {
  return spec.kind === "composite";
}
