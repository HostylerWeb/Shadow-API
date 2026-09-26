"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { inputHelp } from "./input-help";

type Field = { required?: boolean };

export function TestRunSection({
  action,
  connectorId,
  inputs,
  resultUrl,
  gateway,
  keys,
}: {
  action: (formData: FormData) => void;
  connectorId: string;
  inputs: Array<[string, Field]>;
  resultUrl?: string;
  gateway: string;
  keys: Array<{ name: string; keyPrefix: string }>;
}) {
  const hasInputs = inputs.length > 0;
  const [apiKey, setApiKey] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const call = useMemo(() => {
    const body: Record<string, unknown> = { connector_id: connectorId, inputs: {} as Record<string, string> };
    const inputBody = body.inputs as Record<string, string>;
    for (const [name] of inputs) {
      const text = (values[name] ?? "").trim();
      if (text) inputBody[name] = text;
    }
    const shownKey = apiKey.trim() || "YOUR_API_KEY";
    return `curl -s -H "Authorization: Bearer ${shownKey}" \\\n  -H "Content-Type: application/json" \\\n  -d '${JSON.stringify(body)}' \\\n  ${gateway}/v1/jobs`;
  }, [apiKey, connectorId, gateway, inputs, values]);

  if (keys.length === 0) {
    return (
      <section className="card test-run-card">
        <h2>Create an API key first</h2>
        <p>This test is sent with your own API key, the same way your server will call it. You do not have one yet.</p>
        <Link className="btn-primary" href="/keys">Create an API key</Link>
      </section>
    );
  }

  return (
    <section className="card test-run-card">
      <h2>Try your endpoint</h2>
      <p className="test-run-lead">
        Paste one of your API keys. The request below is what we send, and the job page shows the response.
      </p>
      <p className="muted">
        Keys on this account: {keys.map((key) => `${key.name} (${key.keyPrefix}…)`).join(", ")}
      </p>

      <form action={action} className="test-run-form">
        <input type="hidden" name="connector_id" value={connectorId} />
        <label>
          API key
          <input
            name="api_key"
            type="password"
            required
            autoComplete="off"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder="sk_live_…"
          />
        </label>
        {inputs.map(([name, field]) => {
          const help = inputHelp(name);
          return (
            <div key={name} className="test-run-field">
              <label htmlFor={`test-input-${name}`}>
                <span className="test-run-field-title">{help.title}</span>
                <span className="test-run-field-api muted">
                  API field name: <code>{help.apiKey}</code>
                </span>
              </label>
              <p className="test-run-field-hint">{help.hint}</p>
              <input
                id={`test-input-${name}`}
                name={`input_${name}`}
                required={field.required !== false}
                placeholder={help.placeholder}
                autoComplete="off"
                value={values[name] ?? ""}
                onChange={(event) => setValues((prev) => ({ ...prev, [name]: event.target.value }))}
              />
            </div>
          );
        })}
        {!hasInputs ? <p className="muted">This endpoint reads a fixed page, so the inputs object stays empty.</p> : null}
        <h3>The call</h3>
        <pre className="api-preview">{call}</pre>
        <button type="submit" className="btn-primary test-run-submit">
          Run test
        </button>
      </form>

      {resultUrl && resultUrl.includes("{") ? (
        <p className="muted test-run-url-note">
          Your test values are substituted into the results URL pattern you taught (see technical details below).
        </p>
      ) : null}
    </section>
  );
}
