import Link from "next/link";
import { requireSession } from "../actions";
import { CodeTabs } from "./code-tabs";

const toc = [
  ["start", "Start here"],
  ["endpoints", "Endpoints"],
  ["testing", "Testing"],
  ["activity", "Activity"],
  ["keys", "API keys"],
  ["plan", "Plan"],
  ["integrate", "Integrate"],
  ["errors", "Errors"],
] as const;

export default async function DocsPage() {
  await requireSession();
  const base = process.env.GATEWAY_URL ?? "http://localhost:3000";
  return (
    <main className="customer-page docs">
      <header className="docs-hero">
        <p className="docs-kicker">Guide</p>
        <h1>Documentation</h1>
        <p>
          Teach a website, confirm one live test, then call it from your server. The portal test is allowed before you confirm.
          API keys are not.
        </p>
      </header>

      <div className="docs-layout">
        <nav className="docs-toc" aria-label="On this page">
          {toc.map(([id, label]) => (
            <a key={id} href={`#${id}`}>
              {label}
            </a>
          ))}
        </nav>

        <div className="docs-content">
          <section id="start" className="docs-block">
            <h2>Start here</h2>
            <ol className="docs-steps">
              <li>
                <strong>Teach</strong>
                <span>Open the site, mark the row and the fields you want in JSON.</span>
              </li>
              <li>
                <strong>Test</strong>
                <span>Run it once. Read the job JSON.</span>
              </li>
              <li>
                <strong>Confirm</strong>
                <span>On the job page, choose Yes if it looks right. That turns the endpoint on for API keys.</span>
              </li>
              <li>
                <strong>Call</strong>
                <span>
                  <code>POST {base}/v1/jobs</code> returns a job id. Poll, then read <code>/result</code>.
                </span>
              </li>
            </ol>
          </section>

          <section id="endpoints" className="docs-block">
            <h2>Endpoints</h2>
            <p>
              <Link href="/endpoints">My endpoints</Link> lists what you have taught. The API id on each card is <code>connector_id</code>.
            </p>
            <div className="docs-grid">
              <article>
                <h3>Create</h3>
                <p>Name it, describe it, and open the page. Label the page, pick a repeating row for a list, then pick each field.</p>
              </article>
              <article>
                <h3>Edit</h3>
                <p>Rename keys, reorder them, delete one, or add another from the page. Publishing again asks you to confirm a new test.</p>
              </article>
              <article>
                <h3>List of rows</h3>
                <p>One row selector is applied to every matching card. The JSON array is usually <code>items</code>. Rename keys before you publish.</p>
              </article>
              <article>
                <h3>Max results</h3>
                <p>Set 1–500 on the endpoint card. The next run stops there. A finished job keeps the count it already stored.</p>
              </article>
            </div>
          </section>

          <section id="testing" className="docs-block">
            <h2>Testing</h2>
            <p>
              Test uses the same browser flow callers get. A fixed page has no inputs. A lookup shows one field per value you taught. When the job
              finishes, say whether the JSON is right. Yes enables API keys. No opens the editor.
            </p>
          </section>

          <section id="activity" className="docs-block">
            <h2>Activity</h2>
            <p>
              <Link href="/jobs">Activity</Link> is every job: queued, running, succeeded, failed, or cancelled. Open one for the JSON. Cancel only
              while it is still queued or running. Editing the endpoint later does not change a finished job.
            </p>
          </section>

          <section id="keys" className="docs-block">
            <h2>API keys</h2>
            <p>
              <Link href="/keys">API keys</Link> shows the secret once. Keep it on the server. Every gateway request needs{" "}
              <code>Authorization: Bearer YOUR_KEY</code>.
            </p>
          </section>

          <section id="plan" className="docs-block">
            <h2>Plan</h2>
            <p>
              <Link href="/usage">Plan</Link> is the live-run allowance for this month. Starting a live job counts.
            </p>
            <ul className="docs-pills">
              <li>Developer · 10</li>
              <li>Agency · 100</li>
              <li>Enterprise · 1000</li>
            </ul>
          </section>

          <section id="integrate" className="docs-block">
            <h2>Integrate</h2>
            <p>
              Base URL <code>{base}</code>. Each sample starts a job, waits until it leaves the queue, then prints the outputs. Swap in your API id.
              For a lookup, put the taught field inside <code>inputs</code>.
            </p>
            <CodeTabs base={base} />
            <h3>What you get back</h3>
            <pre>{`{
  "job_id": "962245f2-d4bd-4031-b645-ef4524a04c44",
  "status": "succeeded",
  "outputs": {
    "items": [
      { "title": "Sport & SUV Selection", "price": "£1.20", "url": "https://example.com/product/sport-suv-94" }
    ]
  }
}`}</pre>
            <p className="muted">Image fields are absolute image URLs. Link fields are the real site address.</p>
          </section>

          <section id="errors" className="docs-block">
            <h2>Errors</h2>
            <dl className="docs-errors">
              <div>
                <dt>Confirm a successful test</dt>
                <dd>The endpoint is saved, but you have not chosen Yes on a job.</dd>
              </div>
              <div>
                <dt>Live quota exceeded</dt>
                <dd>This month’s plan allowance is used. HTTP 429.</dd>
              </div>
              <div>
                <dt>Invalid API key</dt>
                <dd>The Authorization header is missing or the key was revoked.</dd>
              </div>
              <div>
                <dt>Result not ready</dt>
                <dd>You called /result before the job succeeded. Poll first.</dd>
              </div>
            </dl>
          </section>
        </div>
      </div>
    </main>
  );
}
