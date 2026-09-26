import Link from "next/link";
import { notFound } from "next/navigation";
import { createDb } from "@shadowapi/db";
import { listUserEndpoints } from "../../../src/accounts";
import { tenantJob } from "../../../src/dashboard";
import { Breadcrumb } from "../../breadcrumb";
import { cancelJobAction, confirmEndpointTestAction, requireSession } from "../../actions";
import { isTerminalStatus } from "../job-status-copy";
import { JobPoll } from "../poll";
import { JobDebugPanel } from "../job-debug-panel";

const FAILURES: Record<string, string> = {
  CHALLENGE_REQUIRED: "The site asked for a human check.",
  ARTIFACT_GATE_FAILED: "A file check failed.",
  TARGET_TIMEOUT: "The page took too long.",
  SESSION_EXPIRED: "The saved login expired.",
  GRAPH_STEP_FAILED: "A step on the website broke.",
  VALIDATION_ERROR: "The inputs were rejected.",
  RATE_LIMITED: "Over the rate limit.",
};

export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  const handle = createDb(process.env.DATABASE_URL!);
  const job = await tenantJob(handle.db, session.tenantId, id);
  const endpoints = await listUserEndpoints(handle.db, session.tenantId);
  const titles = new Map(endpoints.map((row) => [row.connectorId, row.title]));
  const endpoint = endpoints.find((row) => row.connectorId === job.connectorId);
  await handle.close();
  if (!job) notFound();
  const outputs = job.outputs as Record<string, unknown> | null;
  const debug = outputs?._debug;
  const responsePayload =
    outputs && isTerminalStatus(job.status)
      ? Object.fromEntries(Object.entries(outputs).filter(([key]) => key !== "_debug"))
      : null;
  const hasResponseBody = responsePayload && Object.keys(responsePayload).length > 0;
  const title = titles.get(job.connectorId) ?? job.connectorId;
  const startedAt = job.createdAt.toISOString().slice(0, 16).replace("T", " ") + " UTC";
  const canCancel = job.status === "queued" || job.status === "running";

  return (
    <main className="customer-page">
      <Breadcrumb items={[{ href: "/jobs", label: "Activity" }, { label: title }]} />
      <header className="page-head">
        <h1>{title}</h1>
        <p className="muted">Job {job.id.slice(0, 8)}…</p>
      </header>

      <JobPoll
        id={job.id}
        initial={job.status}
        initialFailureCode={job.failureCode}
        startedAt={startedAt}
        cancelForm={
          canCancel ? (
            <form action={cancelJobAction}>
              <input type="hidden" name="id" value={job.id} />
              <button type="submit" className="btn-ghost job-cancel-btn">
                Cancel this run
              </button>
            </form>
          ) : undefined
        }
      />

      {job.failureCode ? (
        <p className="banner job-failure-banner">
          {job.failureMessage ?? FAILURES[job.failureCode] ?? job.failureCode}
        </p>
      ) : null}

      {debug ? <JobDebugPanel debug={debug} /> : null}

      {isTerminalStatus(job.status) && endpoint && !endpoint.testPassed ? (
        <section className="card">
          <h2>Did this test look right?</h2>
          <p className="muted">This run used your API key. Say whether the response is what callers should get.</p>
          {job.status === "succeeded" ? (
            <form action={confirmEndpointTestAction} className="inline">
              <input type="hidden" name="connector_id" value={job.connectorId} />
              <button type="submit" name="passed" value="yes" className="btn-primary">Yes, enable this endpoint</button>
              <button type="submit" name="passed" value="no" className="btn-ghost">No, edit the endpoint</button>
            </form>
          ) : (
            <form action={confirmEndpointTestAction}>
              <input type="hidden" name="connector_id" value={job.connectorId} />
              <button type="submit" name="passed" value="no" className="btn-primary">Edit the endpoint</button>
            </form>
          )}
        </section>
      ) : null}

      <section className="card">
        <h2>The call</h2>
        <p className="muted">Same request your server sends. Use the API key you pasted on the test page.</p>
        <pre className="api-preview">{`curl -s -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify({ connector_id: job.connectorId, inputs: job.inputs ?? {} })}' \\
  ${process.env.GATEWAY_URL ?? "http://localhost:3000"}/v1/jobs`}</pre>
      </section>

      {hasResponseBody ? (
        <section className="card job-response-card">
          <h2>API response</h2>
          <p className="muted">This is the JSON your endpoint returned for this run.</p>
          <pre className="api-preview">{JSON.stringify(responsePayload, null, 2)}</pre>
        </section>
      ) : null}

      {!hasResponseBody && !debug && isTerminalStatus(job.status) && job.status === "succeeded" ? (
        <p className="muted">Job succeeded but no output was stored.</p>
      ) : null}

      {!hasResponseBody && !debug && isTerminalStatus(job.status) && job.status === "failed" ? (
        <p className="muted">Run failed with no stored debug trace. Restart the worker after updating code and try again.</p>
      ) : null}

      <p className="job-back-link">
        <Link href="/jobs">← Back to Activity</Link>
      </p>
    </main>
  );
}
