"use client";

import { useEffect, useRef, type RefObject } from "react";
import { attachFrameBridge, setTeachMode, syncPortalOrigin } from "../../../../src/teach/iframe-bridge";
import type { PickPayload } from "../../../../src/teach/protocol";

export type PickMode =
  | { kind: "idle" }
  | { kind: "pickRow" }
  | { kind: "pickNewField"; addAnother: boolean }
  | { kind: "pickReplaceField"; fieldId: string }
  | { kind: "pickFormInput"; addAnother: boolean }
  | { kind: "pickReplaceFormField"; fieldId: string }
  | { kind: "pickInput" };

export type UseTeachPickerOptions = {
  frame: RefObject<HTMLIFrameElement | null>;
  rowSelector: string;
  onPick: (payload: PickPayload) => void;
  onNavigate?: (url: string) => void;
  pickMode: PickMode;
  setPickMode: (mode: PickMode) => void;
};

export function useTeachPicker(options: UseTeachPickerOptions) {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    const detach = attachFrameBridge({
      onNavigate: (navUrl) => {
        optionsRef.current.onNavigate?.(navUrl);
        optionsRef.current.setPickMode({ kind: "idle" });
        setTeachMode(optionsRef.current.frame.current, "off");
      },
      onPicked: (payload) => {
        optionsRef.current.onPick(payload);
        setTeachMode(optionsRef.current.frame.current, "off");
      },
      onSampleResult: () => undefined,
      onSampleSingle: () => undefined,
    });
    return detach;
  }, []);

  useEffect(() => {
    const o = options;
    const frame = o.frame.current;
    if (!frame) return;
    if (o.pickMode.kind === "idle") setTeachMode(frame, "off");
    else if (o.pickMode.kind === "pickRow") setTeachMode(frame, "pickRow");
    else if (o.pickMode.kind === "pickInput" || o.pickMode.kind === "pickFormInput" || o.pickMode.kind === "pickReplaceFormField") setTeachMode(frame, "pickField");
    else if (o.pickMode.kind === "pickNewField" || o.pickMode.kind === "pickReplaceField") {
      setTeachMode(frame, "pickField", o.rowSelector || undefined);
    }
  }, [options]);
}

export function syncPickModeOnLoad(frame: HTMLIFrameElement | null, pickMode: PickMode, rowSelector: string) {
  syncPortalOrigin(frame);
  if (pickMode.kind === "pickRow") setTeachMode(frame, "pickRow");
  else if (pickMode.kind === "pickInput" || pickMode.kind === "pickFormInput" || pickMode.kind === "pickReplaceFormField") setTeachMode(frame, "pickField");
  else if (pickMode.kind === "pickNewField" || pickMode.kind === "pickReplaceField") {
    setTeachMode(frame, "pickField", rowSelector || undefined);
  } else setTeachMode(frame, "off");
}

export function pickModeLabel(mode: PickMode, resultShape: "list" | "single" | "object"): string | null {
  if (mode.kind === "pickRow") return "Click one full result row in the page…";
  if (mode.kind === "pickInput") return "Click a search input in the page…";
  if (mode.kind === "pickFormInput") return "Click a form field your API will fill…";
  if (mode.kind === "pickNewField") {
    if (resultShape === "list") return "Click an element inside a result row…";
    if (resultShape === "object") return "Click any element on the page to add as an API field…";
    return "Click the value to return…";
  }
  if (mode.kind === "pickReplaceField") return "Click again to replace this field…";
  if (mode.kind === "pickReplaceFormField") return "Click the form input to use instead…";
  return null;
}

export function isPicking(mode: PickMode): boolean {
  return mode.kind !== "idle";
}
