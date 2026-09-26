import Link from "next/link";
import { notFound } from "next/navigation";
import { createDb } from "@shadowapi/db";
import { listUserEndpoints } from "../../../src/accounts";
import { tenantJob } from "../../../src/dashboard";
import { Breadcrumb } from "../../breadcrumb";
import { cancelJobAction, requireSession } from "../../actions";
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
  const titles = new Map((await listUserEndpoints(handle.db, session.tenantId)).map((row) => [row.connectorId, row.title]));
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
