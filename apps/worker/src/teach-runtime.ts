import type { NavigationPattern } from "@shadowapi/graph-runner";
import type { GraphDocument } from "@shadowapi/graph-runner";
import type { Page } from "playwright-core";

function sanitizeSelector(selector: string): string {
  return selector
    .replace(/\.shadow-teach-hover\b/g, "")
    .replace(/\.shadow-teach-active\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Cookie walls often cover the control the graph is about to click. Best-effort only. */
export async function dismissCommonConsent(page: Page, trace: string[]): Promise<void> {
  const labels = [/accept all/i, /i accept/i, /agree/i, /allow all/i, /got it/i];
  for (const name of labels) {
    const button = page.getByRole("button", { name }).first();
    const visible = await button.isVisible({ timeout: 400 }).catch(() => false);
    if (!visible) continue;
    await button.click({ timeout: 3_000 }).catch(() => undefined);
    trace.push(`consent: dismissed ${name}`);
    return;
  }
}

export async function runTeachGraph(options: {
  page: Page;
  graph: GraphDocument;
  inputs: Record<string, string>;
  pattern: NavigationPattern;
  resolveUrl: (template: string) => string;
  trace: string[];
  timeoutMs: number;
}): Promise<{ ok: true; finalUrl: string } | { ok: false; message: string }> {
  const { page, graph, inputs, trace, timeoutMs } = options;
  page.setDefaultTimeout(timeoutMs);

  for (const step of graph.steps) {
    if (step.type === "navigate") {
      const url = options.resolveUrl(step.url);
      trace.push(`navigate: ${url}`);
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
      await dismissCommonConsent(page, trace);
      continue;
    }
    if (step.type === "fill") {
      await dismissCommonConsent(page, trace);
      const value = inputs[step.field] ?? "";
      const sel = sanitizeSelector(step.selector);
      trace.push(`fill: ${step.field} → ${sel}`);
      await page.locator(sel).first().fill(value, { timeout: Math.min(timeoutMs, 10_000) });
      continue;
    }
    if (step.type === "click") {
      await dismissCommonConsent(page, trace);
      const sel = step.selector ? sanitizeSelector(step.selector) : undefined;
      if (sel) {
        trace.push(`click: ${sel}`);
        await page.locator(sel).first().click({ timeout: Math.min(timeoutMs, 10_000) });
      }
      continue;
    }
    if (step.type === "wait") {
      if (step.selector) {
        const sel = sanitizeSelector(step.selector);
        trace.push(`wait selector: ${sel}`);
        await page
          .locator(sel)
          .first()
          .waitFor({ state: "attached", timeout: step.timeout_ms ?? 15_000 })
          .catch((err) => trace.push(`wait: ${err instanceof Error ? err.message : String(err)}`));
      } else if (step.loadState) {
        trace.push(`wait load: ${step.loadState}`);
        await page.waitForLoadState(step.loadState, { timeout: step.timeout_ms ?? 15_000 }).catch(() => undefined);
      }
      continue;
    }
    if (step.type === "branch") {
      trace.push(`branch: ${step.patterns.join(",")}`);
      continue;
    }
    if (step.type === "extract") {
      trace.push(`extract step reached url=${page.url()}`);
      return { ok: true, finalUrl: page.url() };
    }
  }
  return { ok: false, message: "Graph ended without extract step." };
}
