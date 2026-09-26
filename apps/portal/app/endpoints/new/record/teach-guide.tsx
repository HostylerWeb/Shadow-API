"use client";

export type TeachGuideStep = {
  id: string;
  label: string;
  done: boolean;
  active: boolean;
};

type NextStepProps = {
  headline: string;
  detail: string;
};

export function TeachProgressBar({ steps }: { steps: TeachGuideStep[] }) {
  return (
    <ol className="teach-progress" aria-label="Progress">
      {steps.map((step, index) => (
        <li
          key={step.id}
          className={step.done ? "done" : step.active ? "active" : ""}
          aria-current={step.active ? "step" : undefined}
        >
          <span className="teach-progress-num">{step.done ? "✓" : index + 1}</span>
          <span className="teach-progress-label">{step.label}</span>
        </li>
      ))}
    </ol>
  );
}

export function TeachNextStep({ headline, detail }: NextStepProps) {
  return (
    <div className="teach-next-hero">
      <p className="teach-next-kicker">What to do now</p>
      <h3 className="teach-next-headline">{headline}</h3>
      <p className="teach-next-detail">{detail}</p>
    </div>
  );
}

export function computeTeachGuide(input: {
  intentPending: boolean;
  onActionPage: boolean;
  onResultPage: boolean;
  hasResultPage: boolean;
  actionUrlSet: boolean;
  formFieldCount: number;
  resultShape: "list" | "single" | "object";
  hasRow: boolean;
  outputFieldCount: number;
  canPublish: boolean;
  picking: boolean;
  pendingPick: boolean;
}): { steps: TeachGuideStep[]; headline: string; detail: string } {
  const labeledStart = !input.intentPending || input.onActionPage || input.onResultPage;
  const formDone = input.formFieldCount > 0 || input.hasResultPage;
  const onResults = input.onResultPage;
  const rowDone = input.resultShape !== "list" || input.hasRow;
  const fieldsDone = input.outputFieldCount > 0;
  const previewOk = input.canPublish;

  const steps: TeachGuideStep[] = [
    {
      id: "label",
      label: "Label pages",
      done: labeledStart && !input.intentPending,
      active: input.intentPending,
    },
    {
      id: "form",
      label: "Map form inputs",
      done: formDone && !input.onActionPage,
      active: (input.onActionPage || (Boolean(input.actionUrlSet) && !input.hasResultPage)) && !input.intentPending,
    },
    {
      id: "build",
      label: "Map results & preview",
      done: previewOk,
      active: onResults && !previewOk && !input.intentPending,
    },
    {
      id: "publish",
      label: "Publish",
      done: false,
      active: previewOk,
    },
  ];

  if (input.pendingPick) {
    return {
      steps,
      headline: "Confirm your click",
      detail: "Check the box in the panel below the website. Use the selection only if it is the right part of the page.",
    };
  }
  if (input.picking) {
    return {
      steps,
      headline: "Click in the website above",
      detail: "The page is listening for your click. Choose the element that matches the button you pressed in the panel.",
    };
  }
  if (input.intentPending) {
    return {
      steps,
      headline: "What is this page?",
      detail: "Pick one option in the panel: where you start, where you search, or where the answers appear.",
    };
  }
  if (input.onActionPage || (input.actionUrlSet && !input.hasResultPage && !input.onResultPage)) {
    if (!input.onActionPage && input.actionUrlSet) {
      return {
        steps,
        headline: "Step 2 — open your search or form page",
        detail: "In the website on the left, go to the page where you search or submit the form, then add each input your API should fill.",
      };
    }
    if (input.formFieldCount === 0) {
      return {
        steps,
        headline: "Step 2 — add form fields",
        detail: "Press “Add form field from page”, then click the search box (or each input) in the website. Name each field in the panel on the right.",
      };
    }
    return {
      steps,
      headline: "Step 2 — run a search, then label results",
      detail: "Use the site like a real user. On the results page, choose “This page shows the answers”. Step 3 starts there.",
    };
  }
  if (input.hasResultPage && !input.onResultPage) {
    return {
      steps,
      headline: "Step 3 — open your results page",
      detail: "Navigate in the website to the page that lists the answers you want in the API.",
    };
  }
  if (input.onResultPage) {
    if (input.resultShape === "list" && !input.hasRow) {
      return {
        steps,
        headline: "Step 3 — pick one result row",
        detail: "Press “Set result row”, then click a single search result (one company, one product — not the whole list container).",
      };
    }
    if (input.outputFieldCount === 0) {
      return {
        steps,
        headline: "Add each piece of data you want in the API",
        detail: "Press “Add output field”, then click name, number, address (or whatever you need) inside one row. Repeat for each column.",
      };
    }
    if (!input.canPublish) {
      return {
        steps,
        headline: "Check the JSON preview",
        detail: "Compare the preview to the website. Re-pick, rename, reorder, or delete fields until the JSON looks right.",
      };
    }
    return {
      steps,
      headline: "You are ready to publish",
      detail: "The preview matches what you want callers to receive. Publish and run a live test.",
    };
  }
  return {
    steps,
    headline: "Browse the website above",
    detail: "Move through the site until you reach the page with the answers, then label each step.",
  };
}
