import type { CarrierRun } from "@shadowapi/graph-runner";
import type { BrowserContextOptions, Page } from "playwright-core";
import { withJobContext } from "./browser.js";
import { extractResultRowsFromPage, mapResultRow, type ResultFieldSpec } from "./result-rows.js";

export type MarkedField = { key: string; selector: string };

export type CustomExtract = {
  kind:
    | "title"
    | "h1"
    | "h2"
    | "list"
    | "text"
    | "main"
    | "result_rows"
    | "marked_list"
    | "marked_single"
    | "marked_page";
  match?: string;
  row_selector?: string;
  fields?: MarkedField[];
  selector?: string;
};

export type CustomManifest = {
  start_url?: string;
  result_url?: string;
  kind?: "read" | "lookup";
  pattern?: "P1" | "P2" | "P3";
  output_name?: string;
  sample_output?: string;
  extract?: CustomExtract;
  result_fields?: ResultFieldSpec[];
  graph_version?: string;
};

const GRAPH_VERSION = "v1.0.0-g1";

export type LiveRunDebug = {
  steps: string[];
  target: string;
  finalUrl?: string;
  rowCount?: number;
  sampleRow?: Record<string, string>;
  error?: string;
};

/** Strip teach-time highlight classes accidentally saved in selectors. */
export function sanitizeSelector(selector: string): string {
  return selector
    .replace(/\.shadow-teach-hover\b/g, "")
    .replace(/\.shadow-teach-active\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function stringInputs(raw: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (value.trim()) out[key] = value.trim();
  }
  return out;
}

export function buildResultUrl(manifest: CustomManifest, inputs: Record<string, string>): string {
  const base = manifest.result_url ?? manifest.start_url ?? "";
  let url = base;
  let templated = false;
  for (const [key, value] of Object.entries(inputs)) {
    const token = `{${key}}`;
    if (url.includes(token)) {
      url = url.split(token).join(encodeURIComponent(value));
      templated = true;
    }
  }
  if (!templated && manifest.kind === "lookup" && manifest.pattern === "P2") {
    try {
      const parsed = new URL(url);
      const key = Object.keys(inputs)[0];
      if (key) {
        parsed.searchParams.set(key, inputs[key] ?? "");
        url = parsed.toString();
      }
    } catch {
      /* keep url */
    }
  }
  return url;
}

function textContent(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function debugPayload(trace: string[], partial: Omit<LiveRunDebug, "steps">): Record<string, unknown> {
  return { _debug: { steps: trace, ...partial } as LiveRunDebug };
}

export async function extractMarkedList(
  page: Page,
  spec: { row_selector: string; fields: MarkedField[] },
  trace?: string[],
): Promise<Record<string, string>[]> {
  const rowSel = sanitizeSelector(spec.row_selector);
  const fields = spec.fields.map((f) => ({ key: f.key, selector: sanitizeSelector(f.selector) }));
  for (const f of spec.fields) {
    if (f.selector !== sanitizeSelector(f.selector)) {
      trace?.push(`sanitize field ${f.key}: ${JSON.stringify(f.selector)} → ${JSON.stringify(sanitizeSelector(f.selector))}`);
    }
  }
  if (spec.row_selector !== rowSel) {
    trace?.push(`sanitize row_selector: ${JSON.stringify(spec.row_selector)} → ${JSON.stringify(rowSel)}`);
  }

  const { rowCount, results } = await page.evaluate(
    ({ rowSel, fields }) => {
      const rows = Array.from(document.querySelectorAll(rowSel)).slice(0, 50);
      const out: Record<string, string>[] = [];
      for (const row of rows) {
        const item: Record<string, string> = {};
        for (const field of fields) {
          const el = row.querySelector(field.selector);
          item[field.key] = el ? (el.textContent ?? "").replace(/\s+/g, " ").trim() : "";
        }
        if (Object.values(item).some((value) => value.length > 0)) out.push(item);
      }
      return { rowCount: rows.length, results: out };
    },
    { rowSel, fields },
  );

  trace?.push(`extract marked_list: dom rows=${rowCount}, non_empty=${results.length}`);
  if (results[0]) trace?.push(`first row keys: ${Object.keys(results[0]).join(", ")}`);
  return results;
}

export async function extractMarkedSingle(page: Page, selector: string, trace?: string[]): Promise<string> {
  const sel = sanitizeSelector(selector);
  if (selector !== sel) trace?.push(`sanitize single selector: ${JSON.stringify(selector)} → ${JSON.stringify(sel)}`);
  const value = await page.evaluate((s) => {
    const el = document.querySelector(s);
    return el ? (el.textContent ?? "").replace(/\s+/g, " ").trim() : "";
  }, sel);
  trace?.push(`extract marked_single: len=${value.length}`);
  return value;
}

async function extractFromPage(page: Page, spec: CustomExtract, trace?: string[]): Promise<string> {
  switch (spec.kind) {
    case "title":
      return (await page.title()).trim();
    case "h1":
      return textContent(await page.locator("h1").first().textContent({ timeout: 3000 }).catch(() => null));
    case "h2":
      return textContent(await page.locator("h2").first().textContent({ timeout: 3000 }).catch(() => null));
    case "list": {
      const lines = (await page.locator("li").allTextContents()).map((line) => line.trim()).filter(Boolean);
      trace?.push(`extract list: ${lines.length} li elements`);
      return lines.slice(0, 20).join("\n");
    }
    case "text": {
      if (spec.match) {
        const body = await page.locator("body").innerText();
        const line = body.split("\n").map((row) => row.trim()).find((row) => row.includes(spec.match!));
        if (line) return line;
      }
      return spec.match?.trim() ?? "";
    }
    case "marked_single":
      return spec.selector ? await extractMarkedSingle(page, spec.selector, trace) : "";
    case "main":
    default: {
      const main = page.locator("main").first();
      if (await main.count()) {
        return textContent(await main.innerText()).slice(0, 4000);
      }
      return textContent(await page.locator("body").innerText()).slice(0, 4000);
    }
  }
}

export async function extractMarkedPage(
  page: Page,
  fields: MarkedField[],
  trace?: string[],
): Promise<Record<string, string>> {
  const sanitized = fields.map((f) => ({ key: f.key, selector: sanitizeSelector(f.selector) }));
  const out = await page.evaluate((fieldSpecs) => {
    const result: Record<string, string> = {};
    for (const field of fieldSpecs) {
      const el = document.querySelector(field.selector);
      result[field.key] = el ? (el.textContent ?? "").replace(/\s+/g, " ").trim() : "";
    }
    return result;
  }, sanitized);
  trace?.push(`extract marked_page: ${Object.values(out).filter((v) => v.length).length}/${fields.length} non-empty`);
  return out;
}

export async function runLiveCustom(options: {
  manifest: CustomManifest;
  inputs: Record<string, string>;
  storageState?: BrowserContextOptions["storageState"];
  timeoutMs?: number;
}): Promise<CarrierRun> {
  const timeoutMs = options.timeoutMs ?? 30_000;
  const manifest = options.manifest;
  const outputName = manifest.output_name ?? "result";
  const extract = manifest.extract ?? { kind: "main" as const };
  const inputs = stringInputs(options.inputs);
  const target = buildResultUrl(manifest, inputs);
  const trace: string[] = [];
  trace.push(
    `manifest pattern=${manifest.pattern ?? "?"} kind=${manifest.kind ?? "?"} extract=${String(extract.kind ?? "main")}`,
  );
  trace.push(`inputs=${JSON.stringify(inputs)}`);
  trace.push(`target=${target}`);

  if (!target.startsWith("http")) {
    return {
      jobStatus: "failed",
      failureCode: "VALIDATION_ERROR",
      failureDetail: "Result URL is not a valid http(s) address after applying inputs.",
      outputs: debugPayload(trace, { target }),
      graphVersion: GRAPH_VERSION,
    };
  }

  try {
    return await withJobContext({ storageState: options.storageState }, async (context) => {
      const page = await context.newPage();
      page.setDefaultTimeout(timeoutMs);
      trace.push(`navigation: goto domcontentloaded (timeout ${timeoutMs}ms)`);
      await page.goto(target, { waitUntil: "domcontentloaded", timeout: timeoutMs });
      trace.push(`navigation: landed url=${page.url()}`);

      const kind = String(extract.kind ?? "");

      if (kind === "marked_list" && extract.row_selector && extract.fields?.length) {
        const rowSel = sanitizeSelector(extract.row_selector);
        await page
          .locator(rowSel)
          .first()
          .waitFor({ state: "attached", timeout: Math.min(timeoutMs, 10_000) })
          .then(() => trace.push(`row selector attached: ${rowSel}`))
          .catch((err) =>
            trace.push(`row selector wait: ${err instanceof Error ? err.message : String(err)} (continuing)`),
          );

        const results = await extractMarkedList(
          page,
          { row_selector: extract.row_selector, fields: extract.fields },
          trace,
        );
        if (!results.length) {
          return {
            jobStatus: "failed",
            failureCode: "GRAPH_STEP_FAILED",
            failureDetail: "No result rows matched your taught selectors on the live page.",
            outputs: debugPayload(trace, { target, finalUrl: page.url(), rowCount: 0 }),
            graphVersion: GRAPH_VERSION,
          };
        }
        return {
          jobStatus: "succeeded",
          outputs: {
            [outputName]: results,
            ...debugPayload(trace, { target, finalUrl: page.url(), rowCount: results.length, sampleRow: results[0] }),
          },
          graphVersion: manifest.graph_version ?? GRAPH_VERSION,
        };
      }

      if (kind === "marked_single" && extract.selector) {
        const value = await extractMarkedSingle(page, extract.selector, trace);
        if (!value) {
          return {
            jobStatus: "failed",
            failureCode: "GRAPH_STEP_FAILED",
            failureDetail: "The taught single field selector did not match any text on the page.",
            outputs: debugPayload(trace, { target, finalUrl: page.url() }),
            graphVersion: GRAPH_VERSION,
          };
        }
        return {
          jobStatus: "succeeded",
          outputs: { [outputName]: value, ...debugPayload(trace, { target, finalUrl: page.url() }) },
          graphVersion: manifest.graph_version ?? GRAPH_VERSION,
        };
      }

      if (kind === "marked_page" && extract.fields?.length) {
        const object = await extractMarkedPage(page, extract.fields, trace);
        if (!Object.values(object).some((v) => v.length > 0)) {
          return {
            jobStatus: "failed",
            failureCode: "GRAPH_STEP_FAILED",
            failureDetail: "None of the taught page fields returned text.",
            outputs: debugPayload(trace, { target, finalUrl: page.url() }),
            graphVersion: GRAPH_VERSION,
          };
        }
        return {
          jobStatus: "succeeded",
          outputs: { ...object, ...debugPayload(trace, { target, finalUrl: page.url() }) },
          graphVersion: manifest.graph_version ?? GRAPH_VERSION,
        };
      }

      if (kind === "result_rows") {
        const results = await extractResultRowsFromPage(page);
        trace.push(`extract result_rows heuristic: ${results.length} rows`);
        if (!results.length) {
          return {
            jobStatus: "failed",
            failureCode: "GRAPH_STEP_FAILED",
            failureDetail: "Heuristic result row detection found nothing on the page.",
            outputs: debugPayload(trace, { target, finalUrl: page.url(), rowCount: 0 }),
            graphVersion: GRAPH_VERSION,
          };
        }
        const fields =
          manifest.result_fields && manifest.result_fields.length > 0
            ? manifest.result_fields
            : [
                { key: "name", source: "heading" as const },
                { key: "number", source: "reference" as const },
                { key: "address", source: "detail" as const },
              ];
        const mapped = results.map((row) => mapResultRow(row, fields));
        return {
          jobStatus: "succeeded",
          outputs: {
            [outputName]: mapped,
            ...debugPayload(trace, { target, finalUrl: page.url(), rowCount: mapped.length, sampleRow: mapped[0] }),
          },
          graphVersion: manifest.graph_version ?? GRAPH_VERSION,
        };
      }

      const value = await extractFromPage(page, extract, trace);
      if (!value) {
        return {
          jobStatus: "failed",
          failureCode: "GRAPH_STEP_FAILED",
          failureDetail: "Generic page extract returned empty content.",
          outputs: debugPayload(trace, { target, finalUrl: page.url() }),
          graphVersion: GRAPH_VERSION,
        };
      }

      return {
        jobStatus: "succeeded",
        outputs: { [outputName]: value, ...debugPayload(trace, { target, finalUrl: page.url() }) },
        graphVersion: manifest.graph_version ?? GRAPH_VERSION,
      };
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    trace.push(`exception: ${message}`);
    const timedOut = /timeout/i.test(message);
    return {
      jobStatus: "failed",
      failureCode: timedOut ? "TARGET_TIMEOUT" : "GRAPH_STEP_FAILED",
      failureDetail: timedOut ? `Timed out: ${message}` : message,
      outputs: debugPayload(trace, { target, error: message }),
      graphVersion: GRAPH_VERSION,
    };
  }
}
