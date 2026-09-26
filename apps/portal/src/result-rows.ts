function stripHtml(fragment: string): string {
  return fragment
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

export type ResultRow = {
  heading: string;
  summary: string;
  detail: string;
};

export type ResultFieldSource = "heading" | "summary" | "detail" | "reference";

export type ResultFieldSpec = {
  key: string;
  source: ResultFieldSource;
};

export const DEFAULT_RESULT_FIELDS: ResultFieldSpec[] = [
  { key: "name", source: "heading" },
  { key: "number", source: "reference" },
  { key: "address", source: "detail" },
];

function rowLooksLikeListing(row: ResultRow, href: string): boolean {
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

export function referenceFromSummary(summary: string): string {
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

export function mappedResultsPreview(rows: ResultRow[], fields: ResultFieldSpec[], limit = 3): string {
  return JSON.stringify({ results: rows.slice(0, limit).map((row) => mapResultRow(row, fields)) }, null, 2);
}

export function parseResultRowsFromHtml(html: string): ResultRow[] {
  const rows: ResultRow[] = [];
  for (const block of html.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)) {
    const chunk = block[1];
    const href = chunk.match(/<h[1-3][\s\S]*?<a[^>]+href="([^"]*)"/i)?.[1] ?? "";
    if (!/<h[1-3][\s\S]*?<a[^>]*>/i.test(chunk)) continue;
    const heading = stripHtml(chunk.match(/<h[1-3][\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i)?.[1] ?? "");
    if (heading.length < 2) continue;
    const paragraphs = [...chunk.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
      .map((match) => stripHtml(match[1]))
      .filter((text) => text.length > 0 && !/matching previous names|total number of appointments/i.test(text));
    if (paragraphs.length < 2) continue;
    const row: ResultRow = { heading, summary: paragraphs[0] ?? "", detail: paragraphs[1] ?? "" };
    if (!rowLooksLikeListing(row, href)) continue;
    rows.push(row);
  }
  const seen = new Set<string>();
  return rows
    .filter((row) => {
      const key = row.heading.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 50);
}
