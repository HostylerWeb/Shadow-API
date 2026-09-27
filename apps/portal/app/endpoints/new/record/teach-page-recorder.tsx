"use client";

export type RecordedAction = {
  action: "fill" | "click";
  selector: string;
  value: string;
  text: string;
  control?: "text" | "select" | "checkbox" | "click";
  keyHint?: string;
};

type Phase = "idle" | "recording" | "paste" | "confirm";

export function TeachPageRecorder(props: {
  phase: Phase;
  stayOnPage: boolean;
  actions: RecordedAction[];
  pasteUrl: string;
  onPasteUrl: (value: string) => void;
  onStart: () => void;
  onStop: () => void;
  onContinuePaste: () => void;
  onFinalYes: () => void;
  onFinalNo: () => void;
}) {
  return (
    <section className="review-block">
      <h3>Use the form once</h3>
      {props.phase === "idle" ? (
        <>
          <p className="muted">
            Press Start recording, then use the website the way a caller would: set the fields and press the button that shows the answers. Then press Stop.
          </p>
          <button type="button" className="btn-primary" onClick={props.onStart}>
            Start recording
          </button>
        </>
      ) : null}
      {props.phase === "recording" ? (
        <>
          <p className="muted">
            {props.stayOnPage
              ? "Set the options in the website, press the button that shows the answers, then press Done."
              : "Use the form in the website, then press Done."}
          </p>
          <ol>
            {props.actions.length === 0 ? <li>Waiting for a field or button…</li> : null}
            {props.actions.map((action, index) => (
              <li key={`${action.selector}-${index}`}>
                {action.action === "fill"
                  ? `Set ${action.control ?? "text"} ${action.selector}${action.value ? ` (${action.value})` : ""}`
                  : `Clicked ${action.text || action.selector}`}
              </li>
            ))}
          </ol>
          <button type="button" className="btn-primary" onClick={props.onStop} disabled={props.actions.length === 0}>
            Done
          </button>
        </>
      ) : null}
      {props.phase === "paste" ? (
        <>
          <p className="muted">
            In your normal browser, finish this step if the preview did not. Paste the address of the page you see now.
          </p>
          <input
            className="browser-url"
            value={props.pasteUrl}
            onChange={(event) => props.onPasteUrl(event.target.value)}
            placeholder="https://"
            aria-label="Page address"
          />
          <button type="button" className="btn-primary" onClick={props.onContinuePaste} disabled={!props.pasteUrl.trim()}>
            Continue
          </button>
        </>
      ) : null}
      {props.phase === "confirm" ? (
        <>
          <p className="muted">Is this the final page where the results are shown?</p>
          <button type="button" className="btn-primary" onClick={props.onFinalYes}>
            Yes, label the results
          </button>
          <button type="button" className="btn-ghost" onClick={props.onFinalNo}>
            No, there is another step
          </button>
        </>
      ) : null}
    </section>
  );
}
