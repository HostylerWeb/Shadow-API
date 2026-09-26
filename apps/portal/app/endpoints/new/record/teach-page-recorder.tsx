"use client";

export type RecordedAction = {
  action: "fill" | "click";
  selector: string;
  value: string;
  text: string;
};

type Phase = "idle" | "recording" | "paste" | "confirm";

export function TeachPageRecorder(props: {
  phase: Phase;
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
      <h3>Record this page</h3>
      {props.phase === "idle" ? (
        <>
          <p className="muted">
            Start recording, then use the page as you normally would: click fields, type values, and click the button. Stop when you are done with this page.
          </p>
          <button type="button" className="btn-primary" onClick={props.onStart}>
            Start recording
          </button>
        </>
      ) : null}
      {props.phase === "recording" ? (
        <>
          <p className="muted">Recording. Fill the form and click the button on this page only.</p>
          <ol>
            {props.actions.length === 0 ? <li>Waiting for a field or button…</li> : null}
            {props.actions.map((action, index) => (
              <li key={`${action.selector}-${index}`}>
                {action.action === "fill"
                  ? `Filled ${action.selector}${action.value ? ` (${action.value})` : ""}`
                  : `Clicked ${action.text || action.selector}`}
              </li>
            ))}
          </ol>
          <button type="button" className="btn-primary" onClick={props.onStop} disabled={props.actions.length === 0}>
            Stop recording this page
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
