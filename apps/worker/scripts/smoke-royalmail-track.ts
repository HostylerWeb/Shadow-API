/**
 * One-off: open Royal Mail track in Camoufox, submit a reference, log URL + body snippet.
 * Usage: pnpm exec tsx scripts/smoke-royalmail-track.ts [REFERENCE]
 */
import { Camoufox } from "camoufox-js";

const reference = process.argv[2]?.trim() || "MZ560246415GB";

async function main() {
  const browser = await Camoufox({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(60_000);

  await page.goto("https://www.royalmail.com/track-your-item", { waitUntil: "domcontentloaded" });
  const accept = page.getByRole("button", { name: /accept all|i accept|agree|allow all/i }).first();
  if (await accept.isVisible({ timeout: 5000 }).catch(() => false)) {
    await accept.click({ timeout: 10_000 }).catch(() => undefined);
  }
  await page.locator("#barcode-input, [placeholder*='123456789']").first().fill(reference);
  await page.getByRole("button", { name: /track your delivery/i }).click();

  await page.waitForTimeout(12_000);

  const url = page.url();
  const text = await page.locator("body").innerText();
  const snippet = text.replace(/\s+/g, " ").slice(0, 500);

  console.log(JSON.stringify({ reference, url, snippet }, null, 2));

  await context.close();
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
