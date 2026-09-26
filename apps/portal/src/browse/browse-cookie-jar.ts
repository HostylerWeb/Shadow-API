import { siteRegistrableHost } from "./rewrite";

type CookieJar = Map<string, string>;

const jars = new Map<string, CookieJar>();

export function browseCookieJarKey(tenantId: string, target: URL): string {
  return `${tenantId}:${siteRegistrableHost(target.hostname)}`;
}

export function readBrowseCookieHeader(jarKey: string): string | undefined {
  const jar = jars.get(jarKey);
  if (!jar?.size) return undefined;
  return [...jar.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
}

function parseSetCookieLine(line: string): { name: string; value: string } | null {
  const part = line.split(";")[0]?.trim();
  if (!part) return null;
  const eq = part.indexOf("=");
  if (eq <= 0) return null;
  const name = part.slice(0, eq).trim();
  const value = part.slice(eq + 1).trim();
  if (!name) return null;
  return { name, value };
}

export function mergeBrowseSetCookies(jarKey: string, response: Response): void {
  const lines =
    typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : (() => {
          const single = response.headers.get("set-cookie");
          return single ? [single] : [];
        })();
  if (!lines.length) return;
  let jar = jars.get(jarKey);
  if (!jar) {
    jar = new Map();
    jars.set(jarKey, jar);
  }
  for (const line of lines) {
    const parsed = parseSetCookieLine(line);
    if (parsed) jar.set(parsed.name, parsed.value);
  }
}

/** Dev-only escape hatch for unit tests. */
export function clearBrowseCookieJars(): void {
  jars.clear();
}
