"use client";

import { requestRowCount, setTeachHighlight } from "../../../../src/teach/iframe-bridge";
import { buildCompositeExtract } from "../../../../src/teach/build-spec";
import type { ExtractBlock } from "@shadowapi/teach-extract";
import { isCompositeExtract } from "@shadowapi/teach-extract";
import { newTeachField, nextFieldKey, nextFormInputKey } from "../../../../src/teach/mapping";
import type { PageIntent, PickPayload, TeachField } from "../../../../src/teach/protocol";
import type { SavedTeachDraft } from "../../../../src/teach/saved-draft";
import { normalizePageKey, pageKeysMatch } from "../../../../src/teach/protocol";
import {
  applyPageIntent,
  canPublish,
  emptyTeachSession,
  hasResultPage,
  isReadOnlyWorkflow,
  lookupKind,
  pendingIntentUrl,
  type TeachSessionState,
} from "../../../../src/teach/session";
import { mirrorBrowseHref } from "../../../../src/browse/browse-mirror";
import { useDebouncedSample } from "../../../../src/teach/use-debounced-sample";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { TeachApiPreview } from "./teach-api-preview";
import { TeachFieldList } from "./teach-field-list";
import { computeTeachGuide, TeachNextStep, TeachProgressBar } from "./teach-guide";
import { TeachPickConfirm } from "./teach-pick-confirm";
import { TeachOutputFieldsBlock } from "./teach-output-fields";
import { TeachResponseBuilder } from "./teach-response-builder";
import { TeachRowBlock } from "./teach-row-block";
import { TeachStep2Callout } from "./teach-step2-callout";
import { TeachPageRecorder, type RecordedAction } from "./teach-page-recorder";
import { isPicking, pickModeLabel, syncPickModeOnLoad, useTeachPicker, type PickMode } from "./use-teach-picker";

type ResultShape = "list" | "single" | "object";

type PendingPick = { mode: PickMode; payload: PickPayload };

function targetFromFrame(frame: HTMLIFrameElement, fallback: string): string {
  try {
    const marked = frame.contentDocument?.documentElement.getAttribute("data-shadow-url");
    if (marked) return marked;
  } catch {
    /* same-origin only */
  }
  return fallback;
}

function elementPreview(el: Element): string {
  const img = el.tagName === "IMG" ? el : el.querySelector("img");
  if (img instanceof HTMLImageElement) {
    const src = img.currentSrc || img.getAttribute("src") || img.getAttribute("data-src") || "";
    if (src) return src;
  }
  const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
  if (text) return text;
  const anchor = el.closest("a[href]");
  const href = anchor?.getAttribute("href") || "";
  return href && !href.startsWith("#") ? href : "";
}

function valueForKey(node: unknown, key: string): string {
  if (!node || typeof node !== "object") return "";
  if (Array.isArray(node)) {
    for (const item of node) {
      const hit = valueForKey(item, key);
      if (hit) return hit;
    }
    return "";
  }
  const record = node as Record<string, unknown>;
  if (typeof record[key] === "string" && record[key]) return record[key];
  for (const value of Object.values(record)) {
    if (value && typeof value === "object") {
      const hit = valueForKey(value, key);
      if (hit) return hit;
    }
  }
  return "";
}

function applySamples(fields: TeachField[], payload: Record<string, unknown>): TeachField[] {
  let changed = false;
  const next = fields.map((field) => {
    const value = valueForKey(payload, field.key);
    if (!value || value === field.sampleText) return field;
    changed = true;
    return { ...field, sampleText: value };
  });
  return changed ? next : fields;
}

export function SiteBrowser({
  action,
  title,
  description,
  url,
  showError,
  saved,
}: {
  action: (formData: FormData) => void;
  title: string;
  description: string;
  url: string;
  showError?: boolean;
  saved?: SavedTeachDraft | null;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const sampleOutput = useRef<HTMLInputElement>(null);
  const extractJson = useRef<HTMLInputElement>(null);
  const formFieldsJson = useRef<HTMLInputElement>(null);
  const [currentUrl, setCurrentUrl] = useState(url);
  const [draftUrl, setDraftUrl] = useState(url);
  const [session, setSession] = useState<TeachSessionState>(() => saved?.session ?? emptyTeachSession(url));
  const [resultShape, setResultShape] = useState<ResultShape>(saved?.resultShape ?? "list");
  const [pickMode, setPickMode] = useState<PickMode>({ kind: "idle" });
  const [guideOpen, setGuideOpen] = useState(true);
  const layoutRef = useRef<HTMLDivElement>(null);
  const dockRef = useRef<HTMLElement>(null);
  const [dockBox, setDockBox] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const [recordPhase, setRecordPhase] = useState<"idle" | "recording" | "paste" | "confirm">("idle");
  const [recordedActions, setRecordedActions] = useState<RecordedAction[]>([]);
  const [pasteUrl, setPasteUrl] = useState("");
  const [teachStages, setTeachStages] = useState<Array<{ url: string; fields: Array<{ key: string; selector: string }>; clickSelector?: string }>>(
    saved?.stages ?? [],
  );
  const stageKey = useRef(1);
  const [pendingPick, setPendingPick] = useState<PendingPick | null>(null);
  const [addAnother, setAddAnother] = useState(false);
  const [rowSelector, setRowSelector] = useState(saved?.rowSelector ?? "");
  const [fields, setFields] = useState<TeachField[]>(saved?.fields ?? []);
  const [formFields, setFormFields] = useState<TeachField[]>(saved?.formFields ?? []);
  const [outputName, setOutputName] = useState(saved?.outputName ?? "value");
  const [listArrayKey, setListArrayKey] = useState(saved?.listArrayKey ?? "items");
  const [extraBlocks, setExtraBlocks] = useState<ExtractBlock[]>(saved?.extraBlocks ?? []);
  const [submitSelector, setSubmitSelector] = useState(saved?.submitSelector ?? "");
  const [requiresSession, setRequiresSession] = useState(saved?.requiresSession ?? false);
  const [rowCount, setRowCount] = useState<number | null>(null);

  const extract = useMemo(() => {
    return buildCompositeExtract({
      resultShape,
      listArrayKey,
      rowSelector,
      fields,
      outputName,
      extraBlocks,
    });
  }, [resultShape, listArrayKey, rowSelector, fields, outputName, extraBlocks]);

  const canSample =
    resultShape === "list"
      ? Boolean(rowSelector && fields.length > 0)
      : Boolean(fields.some((f) => f.selector));

  const intentPending = pendingIntentUrl(session, currentUrl);
  const pageKey = normalizePageKey(currentUrl);
  const labeledIntent = session.pagesByKey[pageKey];
  const canMarkResultHere =
    !hasResultPage(session) &&
    pageKeysMatch(session.startUrl || url, currentUrl) &&
    (labeledIntent === "start" || labeledIntent === "skip" || labeledIntent === "action");
  const onResultPage =
    hasResultPage(session) && pageKeysMatch(session.resultUrl, currentUrl);
  const onActionPage = Boolean(session.actionUrl) && pageKeysMatch(session.actionUrl, currentUrl);
  const readOnlyWorkflow = isReadOnlyWorkflow(session);
  const showFormSection = !readOnlyWorkflow && Boolean(session.actionUrl) && !onResultPage;
  const awaitingResultLabel = !hasResultPage(session) && (formFields.length > 0 || Boolean(session.actionUrl));

  const { rows: sampleRows, previewPayload, error: sampleError, loading: sampleLoading, refresh: refreshSample } = useDebouncedSample(
    frame,
    extract,
    onResultPage && canSample,
  );

  const fieldSamples = useMemo(() => {
    const samples: Record<string, string> = {};
    if (!previewPayload) return samples;
    for (const field of fields) {
      const value = valueForKey(previewPayload, field.key);
      if (value) samples[field.key] = value;
    }
    return samples;
  }, [previewPayload, fields]);

  const mergedSession = useMemo(
    (): TeachSessionState => ({
      ...session,
      extract,
      previewRows: extract && isCompositeExtract(extract) ? undefined : sampleRows,
      previewPayload: previewPayload ?? undefined,
    }),
    [session, extract, sampleRows, previewPayload],
  );

  const userPickedShape = useRef(false);

  useTeachPicker({
    frame,
    rowSelector,
    onPick: (payload) => {
      setPendingPick({ mode: pickMode, payload });
      setPickMode({ kind: "idle" });
    },
    onNavigate: (navUrl) => {
      setCurrentUrl(navUrl);
      setDraftUrl(navUrl);
      setPendingPick(null);
    },
    pickMode,
    setPickMode,
    onRecorded: (action) => {
      if (pickMode.kind !== "record") return;
      setRecordedActions((prev) => {
        if (action.action === "fill") {
          const rest = prev.filter((item) => !(item.action === "fill" && item.selector === action.selector));
          return [...rest, action];
        }
        return [...prev, action];
      });
    },
  });

  useEffect(() => {
    if (!previewPayload) return;
    setFields((prev) => applySamples(prev, previewPayload));
  }, [previewPayload]);

  useEffect(() => {
    if (!rowSelector || !onResultPage || resultShape !== "list" || !frame.current) {
      if (resultShape !== "list") setRowCount(null);
      return;
    }
    void requestRowCount(frame.current, rowSelector)
      .then(setRowCount)
      .catch(() => setRowCount(null));
  }, [rowSelector, onResultPage, currentUrl, resultShape]);

  useEffect(() => {
    if (!onResultPage || !frame.current || pendingPick || isPicking(pickMode)) return;
    if (fields.length === 0 && !rowSelector) {
      setTeachHighlight(frame.current, "", []);
      return;
    }
    setTeachHighlight(frame.current, resultShape === "list" ? rowSelector : "", fields);
  }, [onResultPage, fields, rowSelector, resultShape, pendingPick, pickMode]);

  function goToBrowseUrl(raw: string) {
    let next = raw.trim();
    if (!next) return;
    if (!/^[a-z][a-z0-9+.-]*:/i.test(next)) next = `https://${next}`;
    try {
      const parsed = new URL(next);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return;
      next = parsed.toString();
    } catch {
      return;
    }
    setCurrentUrl(next);
    setDraftUrl(next);
    const node = frame.current;
    if (node) node.src = mirrorBrowseHref(next);
  }

  function onFrameLoad() {
    const node = frame.current;
    if (!node) return;
    syncPickModeOnLoad(node, pickMode, rowSelector);
    const resolved = targetFromFrame(node, currentUrl);
    setCurrentUrl(resolved);
    setDraftUrl(resolved);
    const read = () => {
      refreshSample();
      const doc = node.contentDocument;
      if (!doc) return;
      setFields((prev) => {
        const root = rowSelector ? doc.querySelector(rowSelector) : doc.documentElement;
        if (!root) return prev;
        let changed = false;
        const next = prev.map((field) => {
          const el = root.querySelector(field.selector);
          const value = el ? elementPreview(el) : "";
          if (!value || value === field.sampleText) return field;
          changed = true;
          return { ...field, sampleText: value };
        });
        return changed ? next : prev;
      });
    };
    read();
    window.setTimeout(read, 700);
  }

  function commitRecordedPage(pageUrl: string) {
    const fields: Array<{ key: string; selector: string }> = [];
    let clickSelector: string | undefined;
    for (const action of recordedActions) {
      if (action.action === "fill" && action.selector) {
        fields.push({ key: `field_${stageKey.current++}`, selector: action.selector });
      }
      if (action.action === "click" && action.selector) clickSelector = action.selector;
    }
    const next = [...teachStages, { url: pageUrl, fields, clickSelector }];
    setTeachStages(next);
    setFormFields(next.flatMap((stage) => stage.fields).map((field) => newTeachField({ key: field.key, selector: field.selector })));
    const lastClick = [...next].reverse().find((stage) => stage.clickSelector)?.clickSelector ?? "";
    setSubmitSelector(lastClick);
    setRecordedActions([]);
    return next;
  }

  function labelPage(intent: PageIntent) {
    const targetUrl =
      intentPending ??
      (canMarkResultHere && intent === "result" ? currentUrl : null);
    if (!targetUrl) return;
    setSession((s) => applyPageIntent(s, targetUrl, intent));
  }

  function confirmPendingPick() {
    if (!pendingPick) return;
    const { mode, payload } = pendingPick;
    setPendingPick(null);

    if (mode.kind === "pickRow") {
      setRowSelector(payload.selector);
      return;
    }
    if (mode.kind === "pickInput") {
      setSession((s) => ({ ...s, inputSelector: payload.selector }));
      setFormFields((prev) => {
        if (prev.some((f) => f.selector === payload.selector)) return prev;
        return [...prev, newTeachField({ key: nextFormInputKey(prev), selector: payload.selector, sampleText: payload.text, elementTag: payload.meta.tag })];
      });
      return;
    }
    if (mode.kind === "pickFormInput") {
      setFormFields((prev) => [
        ...prev,
        newTeachField({
          key: nextFormInputKey(prev),
          selector: payload.selector,
          sampleText: payload.text,
          elementTag: payload.meta.tag,
        }),
      ]);
      if (mode.addAnother) setPickMode({ kind: "pickFormInput", addAnother: true });
      return;
    }
    if (mode.kind === "pickNewField") {
      const useRelative = resultShape === "list" && rowSelector;
      setFields((prev) => [
        ...prev,
        newTeachField({
          key: nextFieldKey(prev),
          selector: useRelative ? payload.relativeSelector || payload.selector : payload.selector,
          sampleText: payload.text,
          elementTag: payload.meta.tag,
        }),
      ]);
      if (mode.addAnother) setPickMode({ kind: "pickNewField", addAnother: true });
      return;
    }
    if (mode.kind === "pickReplaceField") {
      setFields((prev) =>
        prev.map((f) =>
          f.id === mode.fieldId
            ? {
                ...f,
                selector:
                  resultShape === "list" && rowSelector
                    ? payload.relativeSelector || payload.selector
                    : payload.selector,
                sampleText: payload.text,
                elementTag: payload.meta.tag,
              }
            : f,
        ),
      );
      return;
    }
    if (mode.kind === "pickReplaceFormField") {
      setFormFields((prev) =>
        prev.map((f) =>
          f.id === mode.fieldId
            ? { ...f, selector: payload.selector, sampleText: payload.text, elementTag: payload.meta.tag }
            : f,
        ),
      );
      return;
    }
    if (mode.kind === "pickSubmit") {
      setSubmitSelector(payload.selector);
      return;
    }
    if (mode.kind === "pickExtraScalar") {
      setExtraBlocks((prev) =>
        prev.map((block, index) =>
          index === mode.blockIndex && block.type === "scalar"
            ? { ...block, selector: payload.selector }
            : block,
        ),
      );
      return;
    }
  }

  function beforePublish(event: FormEvent<HTMLFormElement>) {
    if (!canPublish(mergedSession)) {
      event.preventDefault();
      return;
    }
    let sample = "";
    if (extract && isCompositeExtract(extract) && previewPayload) {
      sample = JSON.stringify(previewPayload);
    } else if (resultShape === "list") sample = JSON.stringify(sampleRows.slice(0, 5));
    else if (resultShape === "object") sample = JSON.stringify(sampleRows[0] ?? {});
    else sample = sampleRows[0]?.[outputName] ?? sampleRows[0]?.result ?? "";
    if (sampleOutput.current) sampleOutput.current.value = sample;
    if (extractJson.current && extract) extractJson.current.value = JSON.stringify(extract);
    if (formFieldsJson.current) formFieldsJson.current.value = JSON.stringify(formFields.map(({ key, selector }) => ({ key, selector })));
    const stagesInput = document.querySelector<HTMLInputElement>('input[name="stagesJson"]');
    if (stagesInput) stagesInput.value = JSON.stringify(teachStages);
  }

  const picking = isPicking(pickMode);
  const pickHint = pickModeLabel(pickMode, resultShape);
  const kind = lookupKind(session);
  const url1 = session.startUrl || url;
  const url2 = session.resultUrl || url1;
  const extractMode =
    resultShape === "list" ? "marked_list" : resultShape === "object" ? "marked_page" : "marked_single";

  const guide = computeTeachGuide({
    readOnlyWorkflow,
    intentPending: Boolean(intentPending),
    onActionPage,
    onResultPage,
    hasResultPage: hasResultPage(session),
    actionUrlSet: Boolean(session.actionUrl),
    formFieldCount: formFields.length,
    resultShape,
    hasRow: Boolean(rowSelector),
    outputFieldCount: fields.length,
    canPublish: canPublish(mergedSession),
    picking,
    pendingPick: Boolean(pendingPick),
  });

  const hideGuideHero = (showFormSection && !intentPending) || Boolean(intentPending);
  const step2FieldMapped = showFormSection && formFields.length > 0 && !intentPending;

  return (
    <form action={action} className="teach-shell card" onSubmit={beforePublish}>
      <div className="teach-shell-inner">
      {saved?.connectorId ? <input type="hidden" name="connectorId" value={saved.connectorId} /> : null}
      <input type="hidden" name="title" value={title} />
      <input type="hidden" name="description" value={description} />
      <input type="hidden" name="url1" value={url1} />
      <input type="hidden" name="url2" value={url2} />
      <input type="hidden" name="mode" value={kind} />
      <input type="hidden" name="pattern" value={session.pattern} />
      <input type="hidden" name="inputName" value={formFields[0]?.key ?? "query"} />
      <input type="hidden" name="templatingSample" value={session.templatingSample} />
      <input ref={sampleOutput} type="hidden" name="sampleOutput" defaultValue="" />
      <input ref={extractJson} type="hidden" name="extractJson" defaultValue="" />
      <input ref={formFieldsJson} type="hidden" name="formFieldsJson" defaultValue="[]" />
      <input type="hidden" name="stagesJson" value={JSON.stringify(teachStages)} />
      <input type="hidden" name="extractMode" value={extractMode} />
      <input type="hidden" name="outputName" value={resultShape === "list" ? listArrayKey : outputName} />
      <input type="hidden" name="submitSelector" value={submitSelector} />
      <input type="hidden" name="requiresSession" value={requiresSession ? "1" : ""} />
      <input type="hidden" name="inputSelector" value={session.inputSelector} />

      {showError ? <p className="banner">Publish failed last time. Check your labels and marks, then try again.</p> : null}

      <TeachProgressBar steps={guide.steps} />

      {pickHint && !pendingPick ? <p className="banner teach-pick-hint">{pickHint}</p> : null}

      {step2FieldMapped && !pendingPick ? (
        <div className="teach-now-banner" role="status">
          <p className="teach-now-banner-kicker">Step 2 complete — your field is saved</p>
          <p className="teach-now-banner-text">
            <strong>Now:</strong> Open the results in a normal browser tab if the preview will not finish the search
            (captcha or bot checks). Paste that results address into the box above, press Go, then click{" "}
            <strong>“This page shows the answers”</strong> — that starts step 3. Live lookups run as jobs, not in this preview.
          </p>
        </div>
      ) : null}

      <div
        ref={layoutRef}
        className={`teach-layout teach-layout-split${step2FieldMapped ? " teach-layout-website-first" : ""}`}
      >
        <div className="teach-browser">
          <div className="browser-chrome">
            <span className="browser-dot" />
            <span className="browser-dot" />
            <span className="browser-dot" />
            <div className="browser-url-form">
              <input
                className="browser-url"
                value={draftUrl}
                onChange={(e) => setDraftUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    goToBrowseUrl(draftUrl);
                  }
                }}
                spellCheck={false}
                aria-label="Website address"
              />
              <button type="button" className="browser-go btn-ghost" onClick={() => goToBrowseUrl(draftUrl)}>
                Go
              </button>
            </div>
          </div>
          <iframe ref={frame} className="browser-frame" title={title} src={mirrorBrowseHref(url)} onLoad={onFrameLoad} />
        </div>

        <aside
          ref={dockRef}
          className={`teach-side teach-dock${guideOpen ? " open" : ""}${dockBox ? " placed" : ""}`}
          style={dockBox ? { left: dockBox.left, top: dockBox.top, width: dockBox.width, height: guideOpen ? dockBox.height : undefined } : undefined}
        >
          <div className="teach-dock-bar">
            <button
              type="button"
              className="teach-dock-grip"
              aria-label="Drag guide"
              onPointerDown={(event) => {
                const dock = dockRef.current;
                const layout = layoutRef.current;
                if (!dock || !layout) return;
                const layoutBox = layout.getBoundingClientRect();
                const box = dock.getBoundingClientRect();
                const origin = {
                  x: event.clientX,
                  y: event.clientY,
                  left: dockBox?.left ?? box.left - layoutBox.left,
                  top: dockBox?.top ?? box.top - layoutBox.top,
                  width: dockBox?.width ?? box.width,
                  height: dockBox?.height ?? box.height,
                };
                const handle = event.currentTarget;
                event.preventDefault();
                handle.setPointerCapture(event.pointerId);
                let next = origin;
                const move = (ev: PointerEvent) => {
                  const bounds = layout.getBoundingClientRect();
                  const left = Math.min(Math.max(0, origin.left + ev.clientX - origin.x), Math.max(0, bounds.width - origin.width));
                  const top = Math.min(Math.max(0, origin.top + ev.clientY - origin.y), Math.max(0, bounds.height - 36));
                  next = { left, top, width: origin.width, height: origin.height };
                  dock.style.right = "auto";
                  dock.style.left = `${next.left}px`;
                  dock.style.top = `${next.top}px`;
                  dock.style.width = `${next.width}px`;
                  dock.style.height = `${next.height}px`;
                };
                const up = () => {
                  handle.removeEventListener("pointermove", move);
                  handle.removeEventListener("pointerup", up);
                  handle.removeEventListener("pointercancel", up);
                  setDockBox(next);
                };
                handle.addEventListener("pointermove", move);
                handle.addEventListener("pointerup", up);
                handle.addEventListener("pointercancel", up);
              }}
            >
              Move
            </button>
            <button type="button" className="teach-dock-toggle" onClick={() => setGuideOpen((open) => !open)}>
              {guideOpen ? "Hide guide" : "Show guide"}
            </button>
          </div>
          {pendingPick ? (
            <TeachPickConfirm
              mode={pendingPick.mode}
              payload={pendingPick.payload}
              onConfirm={confirmPendingPick}
              onCancel={() => setPendingPick(null)}
            />
          ) : null}

          {!hideGuideHero && !pendingPick ? <TeachNextStep headline={guide.headline} detail={guide.detail} /> : null}

          {canMarkResultHere && !intentPending && !pendingPick ? (
            <section className="teach-intent review-block teach-intent-prominent">
              <h3>Same page for answers?</h3>
              <p className="muted">This URL is your starting point. If the API reads this page directly, mark it as the answers page.</p>
              <button type="button" className="btn-primary" onClick={() => labelPage("result")}>
                This page shows the answers
              </button>
            </section>
          ) : null}

          {intentPending && !pendingPick ? (
            <section className="teach-intent review-block teach-intent-prominent">
              <h3>Step 1 · What is this page?</h3>
              <p className="muted">
                {awaitingResultLabel
                  ? "If this is your search results, choose “This page shows the answers”."
                  : "Label this page before continuing."}
              </p>
              <div className="teach-intent-actions">
                <button type="button" onClick={() => labelPage("start")}>Starting point</button>
                <button type="button" onClick={() => labelPage("action")}>I search or fill a form here</button>
                <button type="button" className="btn-primary" onClick={() => labelPage("result")}>
                  This page shows the answers
                </button>
                <button type="button" className="btn-link" onClick={() => labelPage("skip")}>Skip once</button>
              </div>
            </section>
          ) : null}

          {showFormSection && !intentPending && !pendingPick ? (
            <TeachPageRecorder
              phase={recordPhase}
              actions={recordedActions}
              pasteUrl={pasteUrl}
              onPasteUrl={setPasteUrl}
              onStart={() => {
                setRecordedActions([]);
                setRecordPhase("recording");
                setPickMode({ kind: "record" });
              }}
              onStop={() => {
                setPickMode({ kind: "idle" });
                setRecordPhase("paste");
              }}
              onContinuePaste={() => setRecordPhase("confirm")}
              onFinalYes={() => {
                commitRecordedPage(currentUrl);
                const next = pasteUrl.trim();
                goToBrowseUrl(next);
                setSession((s) => applyPageIntent(s, next, "result"));
                setRecordPhase("idle");
                setPasteUrl("");
              }}
              onFinalNo={() => {
                commitRecordedPage(currentUrl);
                goToBrowseUrl(pasteUrl.trim());
                setRecordPhase("idle");
                setPasteUrl("");
              }}
            />
          ) : null}

          {showFormSection && !intentPending && !pendingPick && formFields.length === 0 && recordPhase === "idle" ? (
            <TeachStep2Callout
              fieldCount={formFields.length}
              pickMode={pickMode}
              pendingPick={Boolean(pendingPick)}
              addAnother={addAnother}
              onAddAnotherChange={setAddAnother}
              onAddField={() => setPickMode({ kind: "pickFormInput", addAnother })}
            />
          ) : null}

        {!pendingPick ? (
        <div className="teach-side-body">
        <aside className="teach-panel">
          {showFormSection && formFields.length > 0 ? (
            <section className="review-block teach-mapped-fields-compact">
              <h3>Mapped field{formFields.length === 1 ? "" : "s"}</h3>
              <TeachFieldList
                fields={formFields}
                disabled={picking || Boolean(pendingPick)}
                emptyMessage="No form fields yet."
                onRename={(id, key) => setFormFields((p) => p.map((f) => (f.id === id ? { ...f, key } : f)))}
                onDelete={(id) => setFormFields((p) => p.filter((f) => f.id !== id))}
                onRepick={(id) => setPickMode({ kind: "pickReplaceFormField", fieldId: id })}
                onReorder={(from, to) => {
                  setFormFields((p) => {
                    const next = [...p];
                    const [item] = next.splice(from, 1);
                    next.splice(to, 0, item);
                    return next;
                  });
                }}
              />
              {!onActionPage ? (
                <p className="banner teach-page-hint">
                  Open your search/form page in the website to add or verify fields.
                </p>
              ) : null}
              <button
                type="button"
                className="btn-link teach-add-another-link"
                disabled={picking || Boolean(pendingPick)}
                onClick={() => setPickMode({ kind: "pickFormInput", addAnother })}
              >
                + Map another form field
              </button>
              <button
                type="button"
                className="btn-ghost"
                disabled={picking || Boolean(pendingPick) || !onActionPage}
                onClick={() => setPickMode({ kind: "pickSubmit" })}
              >
                Pick submit control
              </button>
              {submitSelector ? <p className="muted">Submit: {submitSelector}</p> : null}
            </section>
          ) : null}

          {onResultPage ? (
            <>
              <section className="review-block teach-step3-intro">
                <h3>{saved ? "Saved response" : "Step 3 · Build your API response"}</h3>
                <p className="muted">
                  {saved
                    ? "These are the fields already published. Rename a key, drag to reorder, delete one, or click the page to add another. Publish again to save."
                    : "Choose what shape the JSON takes, then click parts of the results page. Watch the preview update on the right."}
                </p>
                <p className="teach-step3-type-label">Response shape</p>
                <div className="teach-shape-cards" role="radiogroup" aria-label="API return type">
                  <button
                    type="button"
                    className={`teach-shape-card${resultShape === "list" ? " selected" : ""}`}
                    disabled={picking}
                    onClick={() => {
                      userPickedShape.current = true;
                      setResultShape("list");
                    }}
                  >
                    <strong>List of rows</strong>
                    <span>Many similar items in a repeating pattern</span>
                  </button>
                  <button
                    type="button"
                    className={`teach-shape-card${resultShape === "object" ? " selected" : ""}`}
                    disabled={picking}
                    onClick={() => {
                      userPickedShape.current = true;
                      setResultShape("object");
                    }}
                  >
                    <strong>Several fields on one page</strong>
                    <span>No repeating row — pick each value separately</span>
                  </button>
                  <button
                    type="button"
                    className={`teach-shape-card${resultShape === "single" ? " selected" : ""}`}
                    disabled={picking}
                    onClick={() => {
                      userPickedShape.current = true;
                      setResultShape("single");
                    }}
                  >
                    <strong>One text value</strong>
                    <span>A single headline, price, or status line</span>
                  </button>
                </div>
                {resultShape === "list" ? (
                  <label style={{ display: "block", marginTop: "0.75rem" }}>
                    JSON array key
                    <input value={listArrayKey} onChange={(e) => setListArrayKey(e.target.value)} disabled={picking} />
                  </label>
                ) : null}
                {resultShape === "single" ? (
                  <label style={{ display: "block", marginTop: "0.75rem" }}>
                    Name in JSON
                    <input value={outputName} onChange={(e) => setOutputName(e.target.value)} disabled={picking} />
                  </label>
                ) : null}
              </section>

              {resultShape === "list" ? (
                <TeachRowBlock
                  rowSelector={rowSelector}
                  rowCount={rowCount}
                  fieldCount={fields.length}
                  picking={pickMode.kind === "pickRow"}
                  disabled={(picking && pickMode.kind !== "pickRow") || Boolean(pendingPick)}
                  onSetRow={() => setPickMode({ kind: "pickRow" })}
                  onChangeRow={() => {
                    if (fields.length > 0 && !window.confirm("Change row? Check field previews still match.")) return;
                    setPickMode({ kind: "pickRow" });
                  }}
                />
              ) : null}

              <TeachOutputFieldsBlock
                fields={fields}
                samples={fieldSamples}
                resultShape={resultShape}
                hasRow={Boolean(rowSelector)}
                picking={picking}
                pendingPick={Boolean(pendingPick)}
                addAnother={addAnother}
                onAddAnotherChange={setAddAnother}
                onAddField={() => setPickMode({ kind: "pickNewField", addAnother })}
                onRename={(id, key) => setFields((p) => p.map((f) => (f.id === id ? { ...f, key } : f)))}
                onDelete={(id) => setFields((p) => p.filter((f) => f.id !== id))}
                onRepick={(id) => setPickMode({ kind: "pickReplaceField", fieldId: id })}
                onReorder={reorderFields}
              />
              <TeachResponseBuilder blocks={extraBlocks} onChange={setExtraBlocks} disabled={picking || Boolean(pendingPick)} />
              {extraBlocks.map((block, index) =>
                block.type === "scalar" && !block.selector ? (
                  <button
                    key={`pick-extra-${index}`}
                    type="button"
                    className="btn-ghost"
                    disabled={picking || Boolean(pendingPick)}
                    onClick={() => setPickMode({ kind: "pickExtraScalar", blockIndex: index })}
                  >
                    Pick selector for {block.key}
                  </button>
                ) : null,
              )}
            </>
          ) : hasResultPage(session) && !showFormSection ? (
            <p className="muted review-block">Step 3 · Navigate to your results page in the website on the left to map outputs.</p>
          ) : !intentPending && !showFormSection && !onResultPage ? (
            <section className="review-block teach-labeled-summary">
              <h3>Your progress</h3>
              <ul className="teach-labeled-list">
                {session.startUrl ? <li>Start: {session.startUrl}</li> : null}
                {session.actionUrl ? <li>Search/form: {session.actionUrl}</li> : null}
                {session.resultUrl ? <li>Results: {session.resultUrl}</li> : null}
              </ul>
              <p className="muted">Browse the site on the left and label any new page, or continue where you left off.</p>
            </section>
          ) : null}
        </aside>

        {onResultPage ? (
        <div className="teach-preview-column">
            <TeachApiPreview
              resultShape={resultShape}
              outputName={outputName}
              listArrayKey={listArrayKey}
              rows={sampleRows}
              previewPayload={previewPayload}
              loading={sampleLoading}
              error={sampleError}
              totalRows={rowCount ?? undefined}
              onRefresh={refreshSample}
              canSample={canSample}
              hasRow={Boolean(rowSelector)}
              fieldCount={fields.length}
            />
        </div>
        ) : null}
        </div>
        ) : null}

        {!pendingPick && canPublish(mergedSession) ? (
          <div className="teach-publish-bar">
            <label className="teach-session-toggle">
              <input
                type="checkbox"
                checked={requiresSession}
                onChange={(e) => setRequiresSession(e.target.checked)}
              />
              Site needs a saved login session (vault)
            </label>
            <button type="submit" className="btn-primary">
              Publish and test
            </button>
            <span className="muted">Preview looks good — publish to run a live test.</span>
          </div>
        ) : !pendingPick && onResultPage ? (
          <p className="teach-publish-locked muted">Finish step 3 until the JSON preview looks right — then publish unlocks.</p>
        ) : null}
          {guideOpen
            ? (["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const).map((edge) => (
                <button
                  key={edge}
                  type="button"
                  className={`teach-dock-resize teach-dock-resize-${edge}`}
                  aria-label={`Resize guide from ${edge}`}
                  onPointerDown={(event) => {
                    const dock = dockRef.current;
                    const layout = layoutRef.current;
                    if (!dock || !layout) return;
                    event.preventDefault();
                    event.stopPropagation();
                    const layoutBox = layout.getBoundingClientRect();
                    const box = dock.getBoundingClientRect();
                    const origin = {
                      x: event.clientX,
                      y: event.clientY,
                      left: dockBox?.left ?? box.left - layoutBox.left,
                      top: dockBox?.top ?? box.top - layoutBox.top,
                      width: dockBox?.width ?? box.width,
                      height: dockBox?.height ?? box.height,
                    };
                    const handle = event.currentTarget;
                    handle.setPointerCapture(event.pointerId);
                    let next = origin;
                    const move = (ev: PointerEvent) => {
                      const bounds = layout.getBoundingClientRect();
                      const dx = ev.clientX - origin.x;
                      const dy = ev.clientY - origin.y;
                      let left = origin.left;
                      let top = origin.top;
                      let width = origin.width;
                      let height = origin.height;
                      if (edge.includes("e")) width = origin.width + dx;
                      if (edge.includes("s")) height = origin.height + dy;
                      if (edge.includes("w")) {
                        width = origin.width - dx;
                        left = origin.left + dx;
                      }
                      if (edge.includes("n")) {
                        height = origin.height - dy;
                        top = origin.top + dy;
                      }
                      const minW = 240;
                      const minH = 160;
                      if (width < minW) {
                        if (edge.includes("w")) left -= minW - width;
                        width = minW;
                      }
                      if (height < minH) {
                        if (edge.includes("n")) top -= minH - height;
                        height = minH;
                      }
                      if (left < 0) {
                        width += left;
                        left = 0;
                      }
                      if (top < 0) {
                        height += top;
                        top = 0;
                      }
                      width = Math.min(width, Math.max(minW, bounds.width - left));
                      height = Math.min(height, Math.max(minH, bounds.height - top));
                      next = { left, top, width, height };
                      dock.style.right = "auto";
                      dock.style.left = `${left}px`;
                      dock.style.top = `${top}px`;
                      dock.style.width = `${width}px`;
                      dock.style.height = `${height}px`;
                    };
                    const up = () => {
                      handle.removeEventListener("pointermove", move);
                      handle.removeEventListener("pointerup", up);
                      handle.removeEventListener("pointercancel", up);
                      setDockBox(next);
                    };
                    handle.addEventListener("pointermove", move);
                    handle.addEventListener("pointerup", up);
                    handle.addEventListener("pointercancel", up);
                  }}
                />
              ))
            : null}
        </aside>
      </div>
      </div>
    </form>
  );

  function reorderFields(fromIndex: number, toIndex: number) {
    setFields((prev) => {
      const next = [...prev];
      const [item] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, item);
      return next;
    });
  }
}
