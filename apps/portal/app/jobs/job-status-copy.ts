export type JobStep = { label: string; state: "done" | "active" | "pending" };

export type JobStatusView = {
  headline: string;
  detail: string;
  steps: JobStep[];
  tone: "wait" | "work" | "ok" | "bad";
};

export function jobStatusView(status: string): JobStatusView {
  switch (status) {
    case "queued":
      return {
        tone: "wait",
        headline: "Waiting to start",
        detail: "Your test is in the queue. A worker will pick it up when one is free.",
        steps: [
          { label: "Job received", state: "done" },
          { label: "Waiting for worker", state: "active" },
          { label: "Open website & run search", state: "pending" },
          { label: "Extract JSON", state: "pending" },
        ],
      };
    case "running":
      return {
        tone: "work",
        headline: "Running your endpoint",
        detail:
          "Camoufox is opening the real website, entering your search, loading the results page, and extracting the fields you taught. This often takes 30 seconds to a few minutes.",
        steps: [
          { label: "Job received", state: "done" },
          { label: "Worker started", state: "done" },
          { label: "Browser on the live site", state: "active" },
          { label: "Extract JSON", state: "pending" },
        ],
      };
    case "succeeded":
      return {
        tone: "ok",
        headline: "Finished",
        detail: "The job completed. Your response is below.",
        steps: [
          { label: "Job received", state: "done" },
          { label: "Worker started", state: "done" },
          { label: "Browser on the live site", state: "done" },
          { label: "Extract JSON", state: "done" },
        ],
      };
    case "failed":
      return {
        tone: "bad",
        headline: "Failed",
        detail: "The run stopped with an error. See the message below if one is shown.",
        steps: [],
      };
    case "cancelled":
      return {
        tone: "bad",
        headline: "Cancelled",
        detail: "This run was cancelled before it finished.",
        steps: [],
      };
    case "blocked":
      return {
        tone: "bad",
        headline: "Blocked",
        detail: "The run could not continue (for example a login or verification step on the site).",
        steps: [],
      };
    default:
      return {
        tone: "wait",
        headline: status,
        detail: "",
        steps: [],
      };
  }
}

export function isTerminalStatus(status: string): boolean {
  return ["succeeded", "failed", "cancelled", "blocked"].includes(status);
}
