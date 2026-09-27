"use client";

import type { TeachControl } from "../../../../src/teach/protocol";

export type RecipeStep = {
  id: string;
  kind: TeachControl;
  key: string;
  selector: string;
  sample: string;
  label: string;
};

function stepLine(step: RecipeStep): string {
  if (step.kind === "click") return `Pressed ${step.label || "a button"}`;
  if (step.kind === "checkbox") return `${step.key}: ${step.sample === "false" ? "off" : "on"}`;
  if (step.sample) return `${step.key}: ${step.sample}`;
  return step.key;
}

export function TeachRecipeList(props: {
  steps: RecipeStep[];
  disabled: boolean;
  replaying: boolean;
  onRename: (id: string, value: string) => void;
  onDelete: (id: string) => void;
  onReplay: () => void;
}) {
  if (props.steps.length === 0) return null;
  return (
    <div>
      <ol className="teach-field-list">
        {props.steps.map((step, index) => (
          <li key={step.id} className="teach-field-row">
            <span>{index + 1}. {stepLine(step)}</span>
            {step.kind === "click" ? null : (
              <input
                aria-label="Name callers will use"
                value={step.key}
                disabled={props.disabled}
                onChange={(event) => props.onRename(step.id, event.target.value)}
              />
            )}
            <button type="button" className="btn-link" disabled={props.disabled} onClick={() => props.onDelete(step.id)}>
              Remove
            </button>
          </li>
        ))}
      </ol>
      <button type="button" className="btn-primary" disabled={props.disabled || props.replaying} onClick={props.onReplay}>
        {props.replaying ? "Trying it…" : "Try it again"}
      </button>
    </div>
  );
}

export function recipeId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `r-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
