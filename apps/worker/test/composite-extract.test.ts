import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { evaluateExtractComposite, normalizeToComposite } from "@shadowapi/teach-extract";
import { closeBrowser, withJobContext } from "../src/browser.js";

const fixturePath = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "marked-list.html");

test("evaluateExtractComposite matches list + scalar blocks on fixture", async () => {
  const html = readFileSync(fixturePath, "utf8");
  const composite = normalizeToComposite({
    kind: "composite",
    blocks: [
      { type: "scalar", key: "page_title", selector: "title" },
      {
        type: "list",
        key: "items",
        row_selector: "#results > li.result",
        fields: [
          { key: "field_1", selector: "h3 a" },
          { key: "field_2", selector: "p:nth-of-type(1)" },
        ],
      },
    ],
  });
  try {
    await withJobContext({}, async (context) => {
      const page = await context.newPage();
      await page.setContent(html);
      const data = await evaluateExtractComposite(page, composite);
      const items = data.items as Record<string, string>[];
      assert.equal(items.length, 2);
      assert.equal(items[0]?.field_1, "ACME LTD");
    });
  } finally {
    await closeBrowser();
  }
});
