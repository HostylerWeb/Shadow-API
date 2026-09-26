export type PageCandidate = { id: string; label: string; value: string };

export type PageSnapshot = {
  url: string;
  title: string;
  mode: "single";
  results: [];
  candidates: PageCandidate[];
};

function stripHtml(fragment: string): string {
  return fragment
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pickUnique(candidates: PageCandidate[]): PageCandidate[] {
  const seen = new Set<string>();
  const out: PageCandidate[] = [];
  for (const row of candidates) {
    const key = row.value.toLowerCase();
    if (key.length < 2 || seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out.slice(0, 12);
}

export async function snapshotPublicPage(url: string): Promise<PageSnapshot | null> {
  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return null;
  }
  if (target.protocol !== "https:" && target.protocol !== "http:") return null;
  const host = target.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local") || /^127\./.test(host) || /^10\./.test(host)) return null;

  const response = await fetch(target, {
    headers: { "user-agent": "ShadowAPI-Portal/1.0", accept: "text/html" },
    redirect: "follow",
    cache: "no-store",
  });
  if (!response.ok) return null;
  const html = await response.text();
  const finalUrl = response.url || url;
  const title = stripHtml(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "") || target.hostname;

  const candidates: PageCandidate[] = [{ id: "title", label: "Page title", value: title }];
  for (const match of html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)) {
    candidates.push({ id: `h1-${candidates.length}`, label: "Main heading", value: stripHtml(match[1]) });
  }
  const merged = pickUnique(candidates);
  if (merged.length === 0) merged.push({ id: "url", label: "This page", value: title });

  return { url: finalUrl, title, mode: "single", results: [], candidates: merged };
}

export function apiResponsePreview(outputName: string, sample: string): string {
  const key = outputName.trim() || "result";
  return JSON.stringify({ [key]: sample }, null, 2);
}
