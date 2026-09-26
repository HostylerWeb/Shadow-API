import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { closeBrowser, withJobContext } from "../src/browser.js";
import { extractMarkedList } from "../src/live-custom.js";

const fixturePath = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "marked-list.html");

test("extractMarkedList reads rows from user selectors", async () => {
  const html = readFileSync(fixturePath, "utf8");
  try {
    await withJobContext({}, async (context) => {
      const page = await context.newPage();
      await page.setContent(html);
      const rows = await extractMarkedList(page, {
        row_selector: "#results > li.result",
        fields: [
          { key: "name", selector: "h3 a" },
          { key: "number", selector: "p:nth-of-type(1)" },
          { key: "address", selector: "p:nth-of-type(2)" },
        ],
      });
      assert.equal(rows.length, 2);
      assert.equal(rows[0]?.name, "ACME LTD");
      assert.equal(rows[0]?.number, "12345678");
      assert.equal(rows[0]?.address, "1 High Street, London");
    });
  } finally {
    await closeBrowser();
  }
});
