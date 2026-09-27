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
    <details className="teach-step-callout">
      <summary>Or pick one control at a time</summary>
      {picking ? (
        <p className="teach-step-callout-active">
          <strong>Now click</strong> that control in the website.
        </p>
      ) : (
        <>
          <p className="muted teach-step-callout-hint">Use this only if recording missed a field. Click the button, then click one control in the website.</p>
          <button type="button" className="btn-ghost teach-step-callout-btn" disabled={disabled} onClick={onAddField}>
            Pick one control
          </button>
          <label className="choice teach-step-callout-choice">
            <input type="checkbox" checked={addAnother} onChange={(e) => onAddAnotherChange(e.target.checked)} />
            Keep picking after each click
          </label>
        </>
      )}
    </details>
  );
}
