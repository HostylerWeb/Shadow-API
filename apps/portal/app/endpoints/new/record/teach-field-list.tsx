"use client";

import type { TeachField } from "../../../../src/teach/protocol";

type Props = {
  fields: TeachField[];
  disabled: boolean;
  emptyMessage?: string;
  onRename: (id: string, key: string) => void;
  onDelete: (id: string) => void;
  onRepick: (id: string) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
};

export function TeachFieldList({
  fields,
  disabled,
  emptyMessage = "No fields yet.",
  onRename,
  onDelete,
  onRepick,
  onReorder,
}: Props) {
  if (fields.length === 0) {
    return <p className="muted">{emptyMessage}</p>;
  }

  return (
    <ul className="teach-field-list">
      {fields.map((field, index) => (
        <li
          key={field.id}
          className="teach-field-row"
          draggable={!disabled}
          onDragStart={(e) => {
            e.dataTransfer.setData("text/plain", String(index));
            e.dataTransfer.effectAllowed = "move";
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
          }}
          onDrop={(e) => {
            e.preventDefault();
            const from = Number(e.dataTransfer.getData("text/plain"));
            if (!Number.isNaN(from) && from !== index) onReorder(from, index);
          }}
        >
          <span className="teach-drag" title="Drag to reorder" aria-hidden>
            ⋮⋮
          </span>
          {field.elementTag ? <span className="teach-field-tag">{field.elementTag}</span> : null}
          <label className="teach-field-key">
            Key
            <input value={field.key} disabled={disabled} onChange={(e) => onRename(field.id, e.target.value)} />
          </label>
          <span className="teach-field-sample" title={field.sampleText ?? ""}>
            {field.sampleText ? truncate(field.sampleText, 48) : "No preview text — re-pick if wrong"}
          </span>
          <div className="teach-field-actions">
            <button type="button" className="btn-link" disabled={disabled} onClick={() => onRepick(field.id)}>
              Re-pick
            </button>
            <button type="button" className="btn-link" disabled={disabled} onClick={() => onDelete(field.id)}>
              Delete
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}
