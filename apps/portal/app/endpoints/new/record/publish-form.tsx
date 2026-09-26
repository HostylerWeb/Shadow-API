"use client";

import { detectNavigationPattern, type NavigationPattern } from "../../../../src/navigation-pattern";
import { useMemo, useState } from "react";

export function WorkflowForm({
  action,
  title,
  description,
  url1,
  initialUrl2 = "",
  initialPattern = "P2",
  initialInput = "",
  initialOutput = "products",
  showError,
  submitLabel = "Publish",
}: {
  action: (formData: FormData) => void;
  title: string;
  description: string;
  url1: string;
  initialUrl2?: string;
  initialPattern?: NavigationPattern;
  initialInput?: string;
  initialOutput?: string;
  showError?: boolean;
  submitLabel?: string;
}) {
  const startsAsRead = !initialUrl2 || initialUrl2 === url1;
  const [mode, setMode] = useState<"read" | "lookup">(startsAsRead ? "read" : "lookup");
  const [url2, setUrl2] = useState(startsAsRead ? "" : initialUrl2);
  const [pattern, setPattern] = useState<NavigationPattern>(startsAsRead ? "P1" : initialPattern);

  const suggested = useMemo(() => {
    if (mode !== "lookup" || !url2.trim()) return null;
    try {
      return detectNavigationPattern(url1, url2.trim());
    } catch {
      return null;
    }
  }, [mode, url1, url2]);

  return (
    <form action={action} className="card workflow-form">
      <input type="hidden" name="title" value={title} />
      <input type="hidden" name="description" value={description} />
      <input type="hidden" name="url1" value={url1} />
      <input type="hidden" name="mode" value={mode} />
      {showError ? <p className="banner">Could not save. If the site moves to another page, paste that URL.</p> : null}

      <p>
        Page: <code>{url1}</code>
      </p>

      <fieldset>
        <legend>Where is the data?</legend>
        <label className="choice">
          <input type="radio" checked={mode === "read"} onChange={() => setMode("read")} />
          Already on this page — a homepage, catalog, or product list
        </label>
        <label className="choice">
          <input type="radio" checked={mode === "lookup"} onChange={() => setMode("lookup")} />
          After a search or form — the site opens a result
        </label>
      </fieldset>

      {mode === "lookup" ? (
        <fieldset>
          <legend>Result page</legend>
          <label>
            URL after you submit one example
            <input name="url2" type="url" required value={url2} placeholder="https://…" onChange={(event) => setUrl2(event.target.value)} />
          </label>
          <div className="pattern-choices">
            {(
              [
                ["P2", "The URL gains a query string (?id=…)"],
                ["P3", "The site opens a different path"],
                ["P1", "The URL stays the same and the page updates"],
              ] as const
            ).map(([value, label]) => (
              <label key={value} className="choice">
                <input type="radio" name="pattern" value={value} checked={pattern === value} onChange={() => setPattern(value)} />
                {label}
                {suggested === value ? <span className="hint">matches your URLs</span> : null}
              </label>
            ))}
          </div>
          <label>
            What your software sends
            <input name="inputName" defaultValue={initialInput || "query"} required placeholder="search" />
          </label>
        </fieldset>
      ) : null}

      <label>
        What your software gets back
        <input name="outputName" defaultValue={initialOutput} required placeholder="products" />
      </label>

      <button type="submit">{submitLabel}</button>
    </form>
  );
}
