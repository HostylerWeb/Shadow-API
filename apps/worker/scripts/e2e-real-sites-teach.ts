/**
 * Publish + live-run taught endpoints against real public websites.
 * Covers read vs lookup, P1/P2/P3, composite list/scalar/fields, and legacy marked extracts.
 */
import { eq } from "drizzle-orm";
import { createDb } from "@shadowapi/db";
import { connectorVersions } from "@shadowapi/db/schema";
import { compositeReady, normalizeToComposite, parseExtractSpec } from "@shadowapi/teach-extract";
import { publishUserEndpoint, signIn } from "../../portal/src/accounts.js";
import { closeBrowser } from "../src/browser.js";
import { runLiveCustom, type CustomManifest } from "../src/live-custom.js";

type Scenario = {
  title: string;
  description: string;
  url1: string;
  url2: string;
  pattern: "P1" | "P2" | "P3";
  inputName: string;
  outputName: string;
  liveInputs: Record<string, string>;
  extractJson: string;
  extractMode?: "marked_list" | "marked_single" | "marked_page";
  templatingSample?: string;
  formFieldsJson?: string;
  submitSelector?: string;
  /** For reporting */
  tags: string[];
};

const scenarios: Scenario[] = [
  {
    title: "Hacker News stories",
    description: "Front page list — news.ycombinator.com",
    url1: "https://news.ycombinator.com/",
    url2: "https://news.ycombinator.com/",
    pattern: "P1",
    inputName: "page",
    outputName: "stories",
    liveInputs: {},
    tags: ["read", "P1", "list", "composite"],
    extractJson: JSON.stringify({
      kind: "composite",
      blocks: [
        {
          type: "list",
          key: "stories",
          row_selector: "tr.athing",
          fields: [
            { key: "title", selector: "span.titleline > a" },
            { key: "site", selector: "span.sitestr" },
          ],
        },
      ],
    }),
  },
  {
    title: "BooksToScrape catalog",
    description: "Online store grid — books.toscrape.com",
    url1: "https://books.toscrape.com/",
    url2: "https://books.toscrape.com/",
    pattern: "P1",
    inputName: "page",
    outputName: "products",
    liveInputs: {},
    tags: ["read", "P1", "list", "store", "composite"],
    extractJson: JSON.stringify({
      kind: "composite",
      blocks: [
        {
          type: "list",
          key: "products",
          row_selector: "article.product_pod",
          fields: [
            { key: "title", selector: "h3 a" },
            { key: "price", selector: "p.price_color" },
          ],
        },
      ],
    }),
  },
  {
    title: "BooksToScrape product",
    description: "Product detail scalars — books.toscrape.com",
    url1: "https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html",
    url2: "https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html",
    pattern: "P1",
    inputName: "page",
    outputName: "product",
    liveInputs: {},
    tags: ["read", "P1", "scalar", "store", "composite"],
    extractJson: JSON.stringify({
      kind: "composite",
      blocks: [
        { type: "scalar", key: "title", selector: "div.product_main h1" },
        { type: "scalar", key: "price", selector: "p.price_color" },
        { type: "scalar", key: "availability", selector: "p.instock" },
      ],
    }),
  },
  {
    title: "BooksToScrape product fields",
    description: "Product detail field group — books.toscrape.com",
    url1: "https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html",
    url2: "https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html",
    pattern: "P1",
    inputName: "page",
    outputName: "product",
    liveInputs: {},
    tags: ["read", "P1", "fields", "store", "composite"],
    extractJson: JSON.stringify({
      kind: "composite",
      blocks: [
        {
          type: "fields",
          fields: [
            { key: "title", selector: "div.product_main h1" },
            { key: "price", selector: "p.price_color" },
            { key: "upc", selector: "table.table-striped td" },
          ],
        },
      ],
    }),
  },
  {
    title: "Books title marked single",
    description: "Legacy marked_single on store product page",
    url1: "https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html",
    url2: "https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html",
    pattern: "P1",
    inputName: "page",
    outputName: "title",
    liveInputs: {},
    extractMode: "marked_single",
    tags: ["read", "P1", "legacy", "store"],
    extractJson: JSON.stringify({
      kind: "marked_single",
      selector: "div.product_main h1",
      output_key: "title",
    }),
  },
  {
    title: "OpenLibrary python books",
    description: "Search results read — openlibrary.org",
    url1: "https://openlibrary.org/search?q=python",
    url2: "https://openlibrary.org/search?q=python",
    pattern: "P1",
    inputName: "page",
    outputName: "books",
    liveInputs: {},
    tags: ["read", "P1", "list", "composite"],
    extractJson: JSON.stringify({
      kind: "composite",
      blocks: [
        {
          type: "list",
          key: "books",
          row_selector: "li.searchResultItem",
          fields: [
            { key: "title", selector: "h3" },
            { key: "author", selector: ".bookauthor" },
          ],
        },
      ],
    }),
  },
  {
    title: "OpenLibrary search P2",
    description: "Query-string result URL — openlibrary.org",
    url1: "https://openlibrary.org/search?q=",
    url2: "https://openlibrary.org/search?q=javascript",
    pattern: "P2",
    inputName: "query",
    outputName: "books",
    templatingSample: "javascript",
    liveInputs: { query: "javascript" },
    tags: ["lookup", "P2", "list", "composite"],
    extractJson: JSON.stringify({
      kind: "composite",
      blocks: [
        {
          type: "list",
          key: "books",
          row_selector: "li.searchResultItem",
          fields: [
            { key: "title", selector: "h3" },
            { key: "author", selector: ".bookauthor" },
          ],
        },
      ],
    }),
  },
  {
    title: "DuckDuckGo search P2",
    description: "Form submit + query result — html.duckduckgo.com",
    url1: "https://html.duckduckgo.com/html/",
    url2: "https://html.duckduckgo.com/html/?q=parcel+tracking+ups",
    pattern: "P2",
    inputName: "query",
    outputName: "results",
    templatingSample: "parcel tracking ups",
    formFieldsJson: JSON.stringify([{ key: "query", selector: "input[name='q']" }]),
    submitSelector: "input[type='submit']",
    liveInputs: { query: "parcel tracking ups" },
    tags: ["lookup", "P2", "form", "list", "composite"],
    extractJson: JSON.stringify({
      kind: "composite",
      blocks: [
        {
          type: "list",
          key: "results",
          row_selector: ".result",
          fields: [
            { key: "title", selector: ".result__a" },
            { key: "snippet", selector: ".result__snippet" },
          ],
        },
      ],
    }),
  },
  {
    title: "Packagetrackr UPS parcel",
    description: "Parcel tracking path URL — packagetrackr.com",
    url1: "https://www.packagetrackr.com/",
    url2: "https://www.packagetrackr.com/track/1Z999AA10123456784",
    pattern: "P3",
    inputName: "tracking_number",
    outputName: "shipment",
    templatingSample: "1Z999AA10123456784",
    liveInputs: { tracking_number: "1Z999AA10123456784" },
    tags: ["lookup", "P3", "shipping", "scalar", "composite"],
    extractJson: JSON.stringify({
      kind: "composite",
      blocks: [
        { type: "scalar", key: "headline", selector: "h1" },
        { type: "scalar", key: "carrier", selector: "h2" },
      ],
    }),
  },
  {
    title: "Packagetrackr marked page",
    description: "Legacy marked_page on tracking result",
    url1: "https://www.packagetrackr.com/",
    url2: "https://www.packagetrackr.com/track/1Z999AA10123456784",
    pattern: "P3",
    inputName: "tracking_number",
    outputName: "shipment",
    templatingSample: "1Z999AA10123456784",
    liveInputs: { tracking_number: "1Z999AA10123456784" },
    extractMode: "marked_page",
    tags: ["lookup", "P3", "shipping", "legacy"],
    extractJson: JSON.stringify({
      kind: "marked_page",
      fields: [
        { key: "headline", selector: "h1" },
        { key: "carrier", selector: "h2" },
      ],
    }),
  },
];

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL required");
  process.env.PORTAL_SESSION_SECRET ??= "dev-portal-session-secret";
  process.env.VAULT_DATA_KEY ??= Buffer.alloc(32, 0).toString("base64");

  const { db, close } = createDb(databaseUrl);
  const session = await signIn(db, "teach-browser-test@example.com", "password-123");
  if (!session) throw new Error("Sign in failed");

  const results: Array<Record<string, unknown>> = [];
  for (const s of scenarios) {
    const spec = parseExtractSpec(s.extractJson);
    const composite = spec ? normalizeToComposite(spec) : null;
    if (!spec || !composite || !compositeReady(composite)) {
      results.push({ title: s.title, ok: false, error: "invalid extract", tags: s.tags });
      continue;
    }
    const pub = await publishUserEndpoint(db, session.userId, session.tenantId, {
      title: s.title,
      description: s.description,
      url1: s.url1,
      url2: s.url2,
      pattern: s.pattern,
      inputName: s.inputName,
      outputName: s.outputName,
      extractJson: s.extractJson,
      extractMode: s.extractMode ?? "marked_list",
      templatingSample: s.templatingSample,
      formFieldsJson: s.formFieldsJson,
      submitSelector: s.submitSelector,
    });
    if (!pub.ok) {
      results.push({ title: s.title, ok: false, error: pub.message, tags: s.tags });
      continue;
    }
    const rows = await db
      .select()
      .from(connectorVersions)
      .where(eq(connectorVersions.connectorId, pub.connectorId))
      .limit(1);
    const manifest = rows[0]?.manifest as CustomManifest | undefined;
    if (!manifest) {
      results.push({ title: s.title, ok: false, error: "manifest missing", tags: s.tags });
      continue;
    }
    try {
      const run = await runLiveCustom({ manifest, inputs: s.liveInputs, timeoutMs: 90_000 });
      const debug = (run.outputs?._debug as { rowCount?: number; steps?: string[] }) ?? {};
      results.push({
        title: s.title,
        connectorId: pub.connectorId,
        ok: run.jobStatus === "succeeded",
        status: run.jobStatus,
        failureDetail: run.failureDetail,
        rowCount: debug.rowCount,
        tags: s.tags,
        steps: debug.steps?.slice(0, 8),
      });
    } catch (err) {
      results.push({ title: s.title, connectorId: pub.connectorId, ok: false, error: String(err), tags: s.tags });
    }
  }
  await closeBrowser().catch(() => undefined);
  await close();

  const failed = results.filter((r) => !r.ok);
  const byTag: Record<string, { pass: number; fail: number }> = {};
  for (const r of results) {
    for (const tag of (r.tags as string[]) ?? []) {
      byTag[tag] ??= { pass: 0, fail: 0 };
      if (r.ok) byTag[tag].pass += 1;
      else byTag[tag].fail += 1;
    }
  }
  console.log(JSON.stringify({ summary: { total: results.length, failed: failed.length, byTag }, results }, null, 2));
  if (failed.length) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
