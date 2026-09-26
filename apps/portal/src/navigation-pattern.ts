export type NavigationPattern = "P1" | "P2" | "P3";

/** Same rules as @shadowapi/graph-runner — kept local so client components stay browser-safe. */
export function detectNavigationPattern(urlBefore: string, urlAfter: string): NavigationPattern {
  const before = new URL(urlBefore);
  const after = new URL(urlAfter);
  const beforeNoHash = `${before.origin}${before.pathname}${before.search}`;
  const afterNoHash = `${after.origin}${after.pathname}${after.search}`;
  if (beforeNoHash === afterNoHash) return "P1";
  if (before.pathname === after.pathname) return "P2";
  return "P3";
}
