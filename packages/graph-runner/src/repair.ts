import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type RepairDiff = {
  selector: string;
  from: string;
  to: string;
  connector_version: string;
  graph_version: string;
};

export function nextGraphVersion(current: string): string {
  const match = current.match(/^(.*-g)(\d+)$/);
  if (!match) return `${current}-g3`;
  return `${match[1]}${Number(match[2]) + 1}`;
}

/** Local stand-in for an offline model. Not called from POST /v1/jobs. */
export function proposeRepairDiff(input: {
  connectorVersion: string;
  graphVersion: string;
  snapshot: string;
}): RepairDiff {
  return {
    selector: "status",
    from: "missing",
    to: input.snapshot,
    connector_version: input.connectorVersion,
    graph_version: nextGraphVersion(input.graphVersion),
  };
}

export function redactPii(fields: string[], value: Record<string, unknown>): Record<string, unknown> {
  const copy = { ...value };
  for (const field of fields) {
    if (field in copy) copy[field] = "[redacted]";
  }
  return copy;
}

export function disallowedInputUrl(inputs: Record<string, unknown>, domains: string[]): string | null {
  for (const raw of Object.values(inputs)) {
    if (typeof raw !== "string" || !raw.includes("://")) continue;
    let host = "";
    try {
      host = new URL(raw).host;
    } catch {
      return "Input URL is not absolute";
    }
    if (!domains.includes(host)) return `URL host ${host} is not allowlisted`;
  }
  return null;
}

export function targetDomainsFor(connectorId: string): string[] {
  const manifestPath = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../../connectors",
    connectorId,
    "manifest.json",
  );
  if (!existsSync(manifestPath)) return [];
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { target_domains?: string[] };
  return manifest.target_domains ?? [];
}
