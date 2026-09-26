import type { CompositeExtract, ExtractBlock, RepeatingBlock } from "@shadowapi/teach-extract";
import type { TeachField } from "./protocol";

export function buildCompositeExtract(input: {
  resultShape: "list" | "single" | "object";
  listArrayKey: string;
  rowSelector: string;
  fields: TeachField[];
  outputName: string;
  extraBlocks: ExtractBlock[];
}): CompositeExtract | null {
  const blocks: ExtractBlock[] = [...input.extraBlocks];

  if (input.resultShape === "list" && input.rowSelector.trim() && input.fields.length > 0) {
    const listBlock: RepeatingBlock = {
      type: "list",
      key: input.listArrayKey.trim() || "items",
      row_selector: input.rowSelector,
      fields: input.fields.map(({ key, selector }) => ({ key, selector })),
    };
    blocks.unshift(listBlock);
  } else if (input.resultShape === "object" && input.fields.some((f) => f.selector)) {
    blocks.unshift({
      type: "fields",
      fields: input.fields.map(({ key, selector }) => ({ key, selector })),
    });
  } else if (input.resultShape === "single" && input.fields[0]?.selector) {
    blocks.unshift({
      type: "scalar",
      key: input.outputName.trim() || "value",
      selector: input.fields[0].selector,
    });
  }

  if (!blocks.length) return null;
  return { kind: "composite", blocks };
}
