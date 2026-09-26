"use client";

import type { PickMode } from "./use-teach-picker";
import { isPicking } from "./use-teach-picker";

type Props = {
  fieldCount: number;
  pickMode: PickMode;
  pendingPick: boolean;
  addAnother: boolean;
  onAddAnotherChange: (value: boolean) => void;
  onAddField: () => void;
};

export function TeachStep2Callout({
  fieldCount,
  pickMode,
  pendingPick,
  addAnother,
  onAddAnotherChange,
  onAddField,
}: Props) {
  const picking = isPicking(pickMode) && pickMode.kind === "pickFormInput";
  const disabled = isPicking(pickMode) || pendingPick;

  if (fieldCount > 0 && !picking) {
    return (
      <div className="teach-step-callout teach-step-callout-muted">
        <p className="teach-step-callout-label">Optional</p>
        <button type="button" className="teach-step-callout-secondary" disabled={disabled} onClick={onAddField}>
          + Map another form field
        </button>
        <label className="choice teach-step-callout-choice">
          <input type="checkbox" checked={addAnother} onChange={(e) => onAddAnotherChange(e.target.checked)} />
          Add another after each click
        </label>
      </div>
    );
  }

  return (
    <div className="teach-step-callout">
      <p className="teach-step-callout-label">Step 2 — map a form field</p>

      {picking ? (
        <p className="teach-step-callout-active">
          <strong>Now click</strong> the search box in the embedded website.
        </p>
      ) : (
        <>
          <button type="button" className="btn-primary teach-step-callout-btn" disabled={disabled} onClick={onAddField}>
            Add form field from page
          </button>
          <p className="muted teach-step-callout-hint">Then click the search input once in the website.</p>
          <label className="choice teach-step-callout-choice">
            <input type="checkbox" checked={addAnother} onChange={(e) => onAddAnotherChange(e.target.checked)} />
            Add another field after each click
          </label>
        </>
      )}
    </div>
  );
}
