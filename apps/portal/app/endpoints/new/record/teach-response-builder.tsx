"use client";

import type { ExtractBlock } from "@shadowapi/teach-extract";

type Props = {
  blocks: ExtractBlock[];
  onChange: (blocks: ExtractBlock[]) => void;
  disabled?: boolean;
};

export function TeachResponseBuilder({ blocks, onChange, disabled }: Props) {
  function nextScalarKey(): string {
    const used = new Set(blocks.filter((b) => b.type === "scalar").map((b) => b.key));
    let n = 1;
    while (used.has(`section_${n}`)) n += 1;
    return `section_${n}`;
  }

  return (
    <section className="review-block teach-response-builder">
      <h4>Additional response sections</h4>
      <p className="muted">Optional extra top-level keys (one value each). Pick selectors after adding.</p>
      {blocks.map((block, index) =>
        block.type === "scalar" ? (
          <div key={`${block.key}-${index}`} className="teach-extra-block">
            <label>
              Key
              <input
                value={block.key}
                disabled={disabled}
                onChange={(e) => {
                  const next = [...blocks];
                  next[index] = { ...block, key: e.target.value };
                  onChange(next);
                }}
              />
            </label>
            <label>
              Selector
              <input
                value={block.selector}
                disabled={disabled}
                readOnly
                placeholder="Pick on page"
              />
            </label>
            <button
              type="button"
              className="btn-link"
              disabled={disabled}
              onClick={() => onChange(blocks.filter((_, i) => i !== index))}
            >
              Remove
            </button>
          </div>
        ) : null,
      )}
      <button
        type="button"
        className="btn-ghost"
        disabled={disabled}
        onClick={() =>
          onChange([...blocks, { type: "scalar", key: nextScalarKey(), selector: "" }])
        }
      >
        + Add one value
      </button>
    </section>
  );
}
