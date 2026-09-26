"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { isTerminalStatus, jobStatusView } from "./job-status-copy";

const FAILURE_HINT: Record<string, string> = {
  TARGET_TIMEOUT: "The website took too long to load or respond. Try again, or teach a simpler path (fewer steps).",
  CHALLENGE_REQUIRED: "The site showed a captcha or bot check — automation cannot pass it yet.",
  GRAPH_STEP_FAILED: "A step in your taught flow failed on the live site (selector or navigation).",
  VALIDATION_ERROR: "The inputs for this run were rejected.",
};

type PollBody = {
  status?: string;
  failureCode?: string | null;
  failureMessage?: string | null;
};

export function JobPoll({
  id,
  initial,
  startedAt,
  initialFailureCode,
  cancelForm,
}: {
  id: string;
  initial: string;
  startedAt?: string;
  initialFailureCode?: string | null;
  cancelForm?: ReactNode;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(initial);
  const [failureCode, setFailureCode] = useState<string | null>(initialFailureCode ?? null);
  const [pollError, setPollError] = useState<string | null>(null);
  const [polls, setPolls] = useState(0);
  const view = jobStatusView(status);
  const active = !isTerminalStatus(status);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/jobs/${id}`, { cache: "no-store" });
      if (!res.ok) {
        setPollError("Could not refresh job status. Try reloading this page.");
        return;
      }
      setPollError(null);
      const body = (await res.json()) as PollBody;
      setPolls((n) => n + 1);
      if (body.failureCode) setFailureCode(body.failureCode);
      if (!body.status) return;
      setStatus((prev) => {
        if (isTerminalStatus(body.status!) && !isTerminalStatus(prev)) {
          queueMicrotask(() => router.refresh());
        }
        return body.status!;
      });
    } catch {
      setPollError("Network error while checking job status.");
    }
  }, [id, router]);

  useEffect(() => {
    if (isTerminalStatus(status)) return;
    void refresh();
    const timer = setInterval(() => void refresh(), 2000);
    return () => clearInterval(timer);
  }, [status, refresh]);

  const slow = active && polls > 15;
  const failureHint = failureCode ? FAILURE_HINT[failureCode] ?? null : null;

  return (
    <>
      <section className={`job-status-card job-status-${view.tone}`} aria-live="polite">
        <div className="job-status-head">
          {active ? <span className="job-status-spinner" aria-hidden /> : null}
          <div>
            <p className="job-status-kicker">{active ? "In progress" : "Status"}</p>
            <h2 className="job-status-headline">{view.headline}</h2>
            {startedAt ? <p className="job-status-meta muted">Started {startedAt}</p> : null}
          </div>
        </div>

        <p className="job-status-detail">{view.detail}</p>

        {view.steps.length > 0 && active ? (
          <ol className="job-status-steps">
            {view.steps.map((step) => (
              <li key={step.label} className={step.state}>
                <span className="job-status-step-icon" aria-hidden>
                  {step.state === "done" ? "✓" : step.state === "active" ? "…" : ""}
                </span>
                {step.label}
              </li>
            ))}
          </ol>
        ) : null}

        {active ? (
          <p className="job-status-poll muted">
            Updating every few seconds. If the status below looks stuck, use <strong>Refresh status</strong>.
          </p>
        ) : null}

        {pollError ? <p className="banner job-status-poll-error">{pollError}</p> : null}

        {slow ? (
          <p className="job-status-slow banner">
            Taking a long time? Ensure the <strong>worker</strong> is running (<code>npm run dev</code> in{" "}
            <code>apps/worker</code>). Without it, jobs stay queued or hang.
          </p>
        ) : null}

        {active ? (
          <div className="job-status-actions">
            <button type="button" className="btn-ghost" onClick={() => void refresh()}>
              Refresh status
            </button>
            {cancelForm}
          </div>
        ) : null}
      </section>

      {failureHint && isTerminalStatus(status) ? <p className="banner job-failure-banner">{failureHint}</p> : null}
    </>
  );
}
