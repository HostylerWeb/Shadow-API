"use client";

import type { TeachField } from "../../../../src/teach/protocol";
import { TeachFieldList } from "./teach-field-list";

type Props = {
  fields: TeachField[];
  resultShape: "list" | "single" | "object";
  hasRow: boolean;
  picking: boolean;
  pendingPick: boolean;
  addAnother: boolean;
  onAddAnotherChange: (value: boolean) => void;
  onAddField: () => void;
  onRename: (id: string, key: string) => void;
  onDelete: (id: string) => void;
  onRepick: (id: string) => void;
  onReorder: (from: number, to: number) => void;
};

export function TeachOutputFieldsBlock({
  fields,
  resultShape,
  hasRow,
  picking,
  pendingPick,
  addAnother,
  onAddAnotherChange,
  onAddField,
  onRename,
  onDelete,
  onRepick,
  onReorder,
}: Props) {
  const disabled = picking || pendingPick;
  const needsRow = resultShape === "list" && !hasRow;
  const stepLabel = resultShape === "list" ? "B" : "A";

  return (
    <section className="teach-step-panel" aria-labelledby="teach-output-title">
      <div className="teach-step-panel-head">
        <span className="teach-step-panel-num">{stepLabel}</span>
        <div>
          <h3 id="teach-output-title">Add columns to the JSON</h3>
          <p className="teach-step-panel-lead">
            {resultShape === "list" ? (
              <>
                For each row, pick what to extract — e.g. company name, number, address. Each pick becomes a key in{" "}
                <code>results[]</code>.
              </>
            ) : (
              <>Click each piece of text you want in the API response. Each pick becomes one JSON key.</>
            )}
          </p>
        </div>
      </div>

      {needsRow ? (
        <p className="teach-step-panel-blocked">Complete step <strong>A</strong> (set a result row) before adding fields.</p>
      ) : (
        <>
          <button type="button" className="teach-step-panel-cta" disabled={disabled} onClick={onAddField}>
            Add output field from page
          </button>
          <p className="muted teach-step-panel-hint">Then click the matching text inside one result row in the website.</p>
          <label className="choice teach-step-panel-choice">
            <input type="checkbox" checked={addAnother} onChange={(e) => onAddAnotherChange(e.target.checked)} />
            Add another field after each click
          </label>
        </>
      )}

      {fields.length > 0 ? (
        <div className="teach-step-panel-fields">
          <h4 className="teach-step-panel-fields-title">Mapped output fields</h4>
          <TeachFieldList
            fields={fields}
            disabled={disabled}
            emptyMessage=""
            onRename={onRename}
            onDelete={onDelete}
            onRepick={onRepick}
            onReorder={onReorder}
          />
        </div>
      ) : null}
    </section>
  );
}
