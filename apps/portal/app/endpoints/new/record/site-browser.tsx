"use client";

import { requestRowCount, setTeachHighlight } from "../../../../src/teach/iframe-bridge";
import { buildListExtract, buildPageExtract, buildSingleExtract, newTeachField, nextFieldKey, nextFormInputKey } from "../../../../src/teach/mapping";
import type { PageIntent, PickPayload, TeachField } from "../../../../src/teach/protocol";
import { normalizePageKey, pageKeysMatch } from "../../../../src/teach/protocol";
import {
  applyPageIntent,
  canPublish,
  emptyTeachSession,
  hasResultPage,
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
import { TeachRowBlock } from "./teach-row-block";
import { TeachStep2Callout } from "./teach-step2-callout";
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

export function SiteBrowser({
  action,
  title,
  description,
  url,
  showError,
}: {
  action: (formData: FormData) => void;
  title: string;
  description: string;
  url: string;
  showError?: boolean;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const sampleOutput = useRef<HTMLInputElement>(null);
  const extractJson = useRef<HTMLInputElement>(null);
  const formFieldsJson = useRef<HTMLInputElement>(null);
  const [currentUrl, setCurrentUrl] = useState(url);
  const [draftUrl, setDraftUrl] = useState(url);
  const [session, setSession] = useState<TeachSessionState>(() => emptyTeachSession(url));
  const [resultShape, setResultShape] = useState<ResultShape>("list");
  const [pickMode, setPickMode] = useState<PickMode>({ kind: "idle" });
  const [pendingPick, setPendingPick] = useState<PendingPick | null>(null);
  const [addAnother, setAddAnother] = useState(false);
  const [rowSelector, setRowSelector] = useState("");
  const [fields, setFields] = useState<TeachField[]>([]);
  const [formFields, setFormFields] = useState<TeachField[]>([]);
  const [outputName, setOutputName] = useState("result");
  const [rowCount, setRowCount] = useState<number | null>(null);

  const extract = useMemo(() => {
    if (resultShape === "list") return buildListExtract(rowSelector, fields);
    if (resultShape === "object") return buildPageExtract(fields);
    return buildSingleExtract(fields);
  }, [resultShape, rowSelector, fields]);

  const canSample =
    resultShape === "list"
      ? Boolean(rowSelector && fields.length > 0)
      : Boolean(fields.some((f) => f.selector));

  const intentPending = pendingIntentUrl(session, currentUrl);
  const onResultPage =
    hasResultPage(session) && pageKeysMatch(session.resultUrl, currentUrl);
  const onActionPage = Boolean(session.actionUrl) && pageKeysMatch(session.actionUrl, currentUrl);
  const showFormSection = Boolean(session.actionUrl) && !onResultPage;
  const awaitingResultLabel = !hasResultPage(session) && (formFields.length > 0 || Boolean(session.actionUrl));

  const { rows: sampleRows, error: sampleError, loading: sampleLoading, refresh: refreshSample } = useDebouncedSample(
    frame,
    extract,
    onResultPage && canSample,
  );

  const mergedSession = useMemo(
    (): TeachSessionState => ({ ...session, extract, previewRows: sampleRows }),
    [session, extract, sampleRows],
  );

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
  });

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
  }

  function labelPage(intent: PageIntent) {
    if (!intentPending) return;
    setSession((s) => applyPageIntent(s, intentPending, intent));
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
    }
  }

  function beforePublish(event: FormEvent<HTMLFormElement>) {
    if (!canPublish(mergedSession)) {
      event.preventDefault();
      return;
    }
    let sample = "";
    if (resultShape === "list") sample = JSON.stringify(sampleRows.slice(0, 5));
    else if (resultShape === "object") sample = JSON.stringify(sampleRows[0] ?? {});
    else sample = sampleRows[0]?.[outputName] ?? sampleRows[0]?.result ?? "";
    if (sampleOutput.current) sampleOutput.current.value = sample;
    if (extractJson.current && extract) extractJson.current.value = JSON.stringify(extract);
    if (formFieldsJson.current) formFieldsJson.current.value = JSON.stringify(formFields.map(({ key, selector }) => ({ key, selector })));
  }

  const picking = isPicking(pickMode);
  const pickHint = pickModeLabel(pickMode, resultShape);
  const kind = lookupKind(session);
  const url1 = session.startUrl || url;
  const url2 = session.resultUrl || url1;
  const extractMode =
    resultShape === "list" ? "marked_list" : resultShape === "object" ? "marked_page" : "marked_single";

  const guide = computeTeachGuide({
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
      <input type="hidden" name="extractMode" value={extractMode} />
      <input type="hidden" name="outputName" value={resultShape === "list" ? "results" : outputName} />
      <input type="hidden" name="inputSelector" value={session.inputSelector} />

      {showError ? <p className="banner">Publish failed last time. Check your labels and marks, then try again.</p> : null}

      <TeachProgressBar steps={guide.steps} />

      {pickHint && !pendingPick ? <p className="banner teach-pick-hint">{pickHint}</p> : null}

      {step2FieldMapped && !pendingPick ? (
        <div className="teach-now-banner" role="status">
          <p className="teach-now-banner-kicker">Step 2 complete — your field is saved</p>
          <p className="teach-now-banner-text">
            <strong>Now:</strong> In the embedded website, run a real search (type a name and press Search).
            When the <strong>results page</strong> opens, click <strong>“This page shows the answers”</strong> — that starts step 3.
          </p>
        </div>
      ) : null}

      <div
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

        <div className="teach-side">
          {pendingPick ? (
            <TeachPickConfirm
              mode={pendingPick.mode}
              payload={pendingPick.payload}
              onConfirm={confirmPendingPick}
              onCancel={() => setPendingPick(null)}
            />
          ) : null}

          {!hideGuideHero && !pendingPick ? <TeachNextStep headline={guide.headline} detail={guide.detail} /> : null}

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

          {showFormSection && !intentPending && !pendingPick && formFields.length === 0 ? (
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
            </section>
          ) : null}

          {onResultPage ? (
            <>
              <section className="review-block teach-step3-intro">
                <h3>Step 3 · Build your API response</h3>
                <p className="muted">
                  Choose what shape the JSON takes, then click parts of the results page. Watch the preview update on the right.
                </p>
                <p className="teach-step3-type-label">Response shape</p>
                <div className="teach-shape-cards" role="radiogroup" aria-label="API return type">
                  <button
                    type="button"
                    className={`teach-shape-card${resultShape === "list" ? " selected" : ""}`}
                    disabled={picking}
                    onClick={() => setResultShape("list")}
                  >
                    <strong>List of rows</strong>
                    <span>Many similar items (search results, product lists)</span>
                  </button>
                  <button
                    type="button"
                    className={`teach-shape-card${resultShape === "object" ? " selected" : ""}`}
                    disabled={picking}
                    onClick={() => setResultShape("object")}
                  >
                    <strong>Several fields on one page</strong>
                    <span>No repeating row — pick each value separately</span>
                  </button>
                  <button
                    type="button"
                    className={`teach-shape-card${resultShape === "single" ? " selected" : ""}`}
                    disabled={picking}
                    onClick={() => setResultShape("single")}
                  >
                    <strong>One text value</strong>
                    <span>A single headline, price, or status line</span>
                  </button>
                </div>
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
              rows={sampleRows}
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
            <button type="submit" className="btn-primary">
              Publish and test
            </button>
            <span className="muted">Preview looks good — publish to run a live test.</span>
          </div>
        ) : !pendingPick && onResultPage ? (
          <p className="teach-publish-locked muted">Finish step 3 until the JSON preview looks right — then publish unlocks.</p>
        ) : null}
        </div>
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
