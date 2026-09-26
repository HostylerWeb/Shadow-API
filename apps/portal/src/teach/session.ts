import { detectNavigationPattern, type NavigationPattern } from "../navigation-pattern";
import type { MarkedExtract, MarkedListExtract, PageIntent } from "./protocol";
import { normalizePageKey } from "./protocol";
import { sampleHasValues } from "./mapping";
import { compositeReady, extractHasNonEmptyOutput, isCompositeExtract, normalizeToComposite } from "@shadowapi/teach-extract";

export type TeachSessionState = {
  pagesByKey: Record<string, PageIntent>;
  startUrl: string;
  resultUrl: string;
  actionUrl: string;
  inputSelector: string;
  pattern: NavigationPattern;
  extract: MarkedExtract | null;
  templatingSample: string;
  /** Set by UI when preview has loaded rows or composite object */
  previewRows?: Record<string, string>[];
  previewPayload?: Record<string, unknown>;
};

export function emptyTeachSession(initialUrl: string): TeachSessionState {
  return {
    pagesByKey: {},
    startUrl: initialUrl,
    resultUrl: "",
    actionUrl: "",
    inputSelector: "",
    pattern: "P1",
    extract: null,
    templatingSample: "",
  };
}

export function applyPageIntent(
  state: TeachSessionState,
  url: string,
  intent: PageIntent,
): TeachSessionState {
  const key = normalizePageKey(url);
  const pagesByKey = { ...state.pagesByKey, [key]: intent };
  let { startUrl, resultUrl, actionUrl, pattern, templatingSample } = state;

  if (intent === "start") startUrl = url;
  if (intent === "result") {
    resultUrl = url;
    templatingSample = guessTemplatingSample(startUrl, url);
    try {
      pattern = detectNavigationPattern(startUrl, url);
    } catch {
      pattern = "P2";
    }
  }
  if (intent === "action") actionUrl = url;

  return { ...state, pagesByKey, startUrl, resultUrl, actionUrl, pattern, templatingSample };
}

export function guessTemplatingSample(startUrl: string, resultUrl: string): string {
  try {
    const start = new URL(startUrl);
    const result = new URL(resultUrl);
    for (const [key, value] of result.searchParams) {
      if (value && !start.searchParams.get(key)) return value;
    }
    for (const [key, value] of result.searchParams) {
      const other = start.searchParams.get(key);
      if (value && other !== value) return value;
    }
  } catch {
    /* ignore */
  }
  return "";
}

export function pendingIntentUrl(state: TeachSessionState, currentUrl: string): string | null {
  const key = normalizePageKey(currentUrl);
  if (state.pagesByKey[key]) return null;
  return currentUrl;
}

export function hasResultPage(state: TeachSessionState): boolean {
  return Boolean(state.resultUrl);
}

export function isReadOnlyWorkflow(state: TeachSessionState): boolean {
  if (!state.resultUrl) return false;
  return normalizePageKey(state.startUrl) === normalizePageKey(state.resultUrl);
}

export function lookupKind(state: TeachSessionState): "read" | "lookup" {
  if (!state.resultUrl) return "read";
  if (normalizePageKey(state.startUrl) === normalizePageKey(state.resultUrl)) return "read";
  return "lookup";
}

export function listExtractReady(extract: MarkedExtract | null): extract is MarkedListExtract {
  return extract?.kind === "marked_list" && extract.row_selector.length > 0 && extract.fields.length > 0;
}

export function canPublish(state: TeachSessionState): boolean {
  if (!state.resultUrl) return false;
  if (!state.extract) return false;
  if (isCompositeExtract(state.extract)) {
    if (!compositeReady(state.extract)) return false;
    if (state.previewPayload !== undefined) {
      return extractHasNonEmptyOutput(state.previewPayload);
    }
    return true;
  }
  if (state.extract.kind === "marked_single") {
    return state.extract.selector.length > 0;
  }
  if (state.extract.kind === "marked_page") {
    if (!state.extract.fields.length) return false;
    if (state.previewRows !== undefined) {
      if (state.previewRows.length === 0) return false;
      return sampleHasValues(state.previewRows);
    }
    return true;
  }
  if (state.extract.kind === "marked_list") {
    if (!state.extract.row_selector || !state.extract.fields.length) return false;
    if (state.previewRows !== undefined) {
      if (state.previewRows.length === 0) return false;
      return sampleHasValues(state.previewRows);
    }
    return true;
  }
  return listExtractReady(state.extract);
}
