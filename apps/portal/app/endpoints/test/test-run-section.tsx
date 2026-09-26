import Link from "next/link";
import { runJobAction } from "../../actions";
import { inputHelp } from "./input-help";

type Field = { required?: boolean };

export function TestRunSection({
  connectorId,
  inputs,
  resultUrl,
}: {
  connectorId: string;
  inputs: Array<[string, Field]>;
  resultUrl?: string;
}) {
  const hasInputs = inputs.length > 0;

  return (
    <section className="card test-run-card">
      <h2>Try your endpoint</h2>
      <p className="test-run-lead">
        We run the same browser flow you taught — fill in the site, open results, return JSON. You do not need to remember technical names; just
        use normal website values below.
      </p>

      <ol className="test-run-steps">
        <li>
          {hasInputs ? "Enter what you would type on the live website." : "No extra text needed — this endpoint reads a fixed page."}
        </li>
        <li>
          Click <strong>Run test</strong>.
        </li>
        <li>
          We open the job result automatically (or find it under <Link href="/jobs">Activity</Link>).
        </li>
      </ol>

      <form action={runJobAction} className="test-run-form">
        <input type="hidden" name="connector_id" value={connectorId} />
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
              />
            </div>
          );
        })}
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
