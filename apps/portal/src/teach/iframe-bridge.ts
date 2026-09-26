import type { MarkedExtract, PickPayload, ShadowFromFrame, ShadowToFrame, TeachField } from "./protocol";
import { isShadowFromFrame } from "./protocol";

export type FrameBridgeHandlers = {
  onNavigate: (url: string) => void;
  onPicked: (payload: PickPayload) => void;
  onSampleResult: (requestId: string, results: Record<string, string>[] | null, error?: string) => void;
  onSampleSingle: (requestId: string, value: string | null, error?: string) => void;
  onRowCount?: (requestId: string, count: number, error?: string) => void;
  onRecorded?: (action: { action: "fill" | "click"; selector: string; value: string; text: string }) => void;
};

export function attachFrameBridge(handlers: FrameBridgeHandlers): () => void {
  const portalOrigin = typeof window !== "undefined" ? window.location.origin : "";

  function onMessage(event: MessageEvent) {
    if (portalOrigin && event.origin !== portalOrigin) return;
    const data: unknown = event.data;
    if (!isShadowFromFrame(data)) return;

    if (data.type === "shadow:navigate") handlers.onNavigate(data.url);
    else if (data.type === "shadow:teach:picked") {
      handlers.onPicked({
        selector: data.selector,
        relativeSelector: data.relativeSelector,
        text: data.text,
        meta: data.meta,
      });
    } else if (data.type === "shadow:teach:sampleResult") {
      handlers.onSampleResult(data.requestId, data.results, data.error);
    }     else if (data.type === "shadow:teach:sampleSingle") {
      handlers.onSampleSingle(data.requestId, data.value, data.error);
    } else if (data.type === "shadow:teach:rowCount") {
      handlers.onRowCount?.(data.requestId, data.count, data.error);
    } else if (data.type === "shadow:teach:recorded") {
      handlers.onRecorded?.({ action: data.action, selector: data.selector, value: data.value, text: data.text });
    }
  }

  window.addEventListener("message", onMessage);
  return () => window.removeEventListener("message", onMessage);
}

export function postToFrame(frame: HTMLIFrameElement | null, message: ShadowToFrame) {
  if (!frame?.contentWindow) return;
  frame.contentWindow.postMessage(message, window.location.origin);
}

export function syncPortalOrigin(frame: HTMLIFrameElement | null) {
  postToFrame(frame, { type: "shadow:portal:origin", origin: window.location.origin });
}

export function setTeachMode(
  frame: HTMLIFrameElement | null,
  mode: "off" | "pickRow" | "pickField" | "record",
  rowSelector?: string,
) {
  postToFrame(frame, { type: "shadow:teach:mode", mode, rowSelector });
}

let sampleCounter = 0;

export function requestSample(frame: HTMLIFrameElement | null, spec: MarkedExtract): Promise<Record<string, string>[]> {
  const requestId = `sample-${Date.now()}-${sampleCounter++}`;
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("Sample timed out"));
    }, 8000);

    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      const data = event.data as ShadowFromFrame;
      if (!data || typeof data !== "object") return;
      if (data.type === "shadow:teach:sampleResult" && data.requestId === requestId) {
        cleanup();
        if (data.error) reject(new Error(data.error));
        else resolve(data.results ?? []);
      }
      if (data.type === "shadow:teach:sampleSingle" && data.requestId === requestId) {
        cleanup();
        if (data.error) reject(new Error(data.error));
        else resolve(data.value ? [{ result: data.value }] : []);
      }
      if (data.type === "shadow:teach:sampleObject" && data.requestId === requestId) {
        cleanup();
        if (data.error) reject(new Error(data.error));
        else resolve(data.object ? [data.object] : []);
      }
    }

    function cleanup() {
      window.clearTimeout(timeout);
      window.removeEventListener("message", onMessage);
    }

    window.addEventListener("message", onMessage);
    postToFrame(frame, { type: "shadow:teach:sample", requestId, spec });
  });
}

let rowCountCounter = 0;

export function requestRowCount(frame: HTMLIFrameElement | null, rowSelector: string): Promise<number> {
  const requestId = `rows-${Date.now()}-${rowCountCounter++}`;
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("Row count timed out"));
    }, 5000);

    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      const data = event.data as ShadowFromFrame;
      if (!data || typeof data !== "object") return;
      if (data.type === "shadow:teach:rowCount" && data.requestId === requestId) {
        cleanup();
        if (data.error) reject(new Error(data.error));
        else resolve(data.count);
      }
    }

    function cleanup() {
      window.clearTimeout(timeout);
      window.removeEventListener("message", onMessage);
    }

    window.addEventListener("message", onMessage);
    postToFrame(frame, { type: "shadow:teach:rowCount", requestId, row_selector: rowSelector });
  });
}

export function setTeachHighlight(
  frame: HTMLIFrameElement | null,
  rowSelector: string,
  fields: TeachField[],
) {
  postToFrame(frame, {
    type: "shadow:teach:highlight",
    row_selector: rowSelector || undefined,
    fields: fields.map(({ key, selector }) => ({ key, selector })),
  });
}
