export type ResultRow = {
  heading: string;
  summary: string;
  detail: string;
};

export type ResultFieldSpec = {
  key: string;
  source: "heading" | "summary" | "detail" | "reference";
};

function referenceFromSummary(summary: string): string {
  return summary.match(/\b(\d{5,10})\b/)?.[1] ?? "";
}

export function mapResultRow(row: ResultRow, fields: ResultFieldSpec[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const field of fields) {
    if (field.source === "heading") out[field.key] = row.heading;
    else if (field.source === "summary") out[field.key] = row.summary;
    else if (field.source === "detail") out[field.key] = row.detail;
    else if (field.source === "reference") out[field.key] = referenceFromSummary(row.summary);
  }
  return out;
}

export async function extractResultRowsFromPage(page: import("playwright-core").Page): Promise<ResultRow[]> {
  return page.evaluate(() => {
    function ok(row: { heading: string; summary: string; detail: string }, href: string) {
      const blob = `${row.heading} ${row.summary} ${row.detail}`.toLowerCase();
      if (/cookie|analytics|essential cookies|accept all|reject all|sign in|privacy|view cookies|we use some/.test(blob)) {
        return false;
      }
      if (/\{\{/.test(row.heading) || /\{\{/.test(row.detail)) return false;
      if (row.heading.length < 4) return false;
      if (href === "#" || /cookie|privacy|login|sign-in/i.test(href)) return false;
      if (!row.detail || row.detail.length < 8) return false;
      if (!/\d/.test(row.summary) && row.summary.length < 12) return false;
      return true;
    }
    const rows: Array<{ heading: string; summary: string; detail: string }> = [];
    for (const li of document.querySelectorAll("li")) {
      const link = li.querySelector("h1 a, h2 a, h3 a") as HTMLAnchorElement | null;
      if (!link) continue;
      const href = link.getAttribute("href") ?? "";
      const heading = link.textContent?.trim() ?? "";
      const paragraphs = [...li.querySelectorAll("p")]
        .map((p) => p.textContent?.trim() ?? "")
        .filter((text) => text.length > 0 && !/matching previous names|total number of appointments/i.test(text));
      if (paragraphs.length < 2) continue;
      const row = { heading, summary: paragraphs[0] ?? "", detail: paragraphs[1] ?? "" };
      if (!ok(row, href)) continue;
      rows.push(row);
    }
    const seen = new Set<string>();
    return rows.filter((row) => {
      const key = row.heading.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 50);
  });
}
