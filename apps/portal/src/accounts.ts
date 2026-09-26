import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { and, count, eq, isNotNull, isNull, sql } from "drizzle-orm";
import type { Db } from "@shadowapi/db";
import { decryptVault, encryptVault } from "@shadowapi/core";
import { compileStudioGraph, compileTeachGraph, loadCarrierFixture, loadGraph, replayStudioGraph, runCarrierFixture, runWarehouseFixture, loadWarehouseFixture, STUDIO_CONNECTOR_ID, STUDIO_GRAPH_VERSION, waitSelectorFromExtract } from "@shadowapi/graph-runner";
import type { NavigationPattern } from "@shadowapi/graph-runner";
import {
  compositeReady,
  normalizeToComposite,
  outputSchemaFromSpec,
  parseExtractSpec,
  primaryOutputName,
  type ExtractSpec,
} from "@shadowapi/teach-extract";
import type { MarkedExtract } from "./teach/protocol";
import { apiKeys, auditLog, connectorVersions, graphRepairs, portalUsers, tenants, usageEvents, vaultSessions } from "@shadowapi/db/schema";

const manifestPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../connectors/carrier_x_pod/manifest.json",
);

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 32).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const next = scryptSync(password, salt, 32);
  const prev = Buffer.from(hash, "hex");
  return next.length === prev.length && timingSafeEqual(next, prev);
}

function hashKey(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

async function publishManifest(db: Db, filePath: string): Promise<void> {
  const manifest = JSON.parse(readFileSync(filePath, "utf8")) as {
    connector_id: string;
    connector_version: string;
    graph_version: string;
  };
  const existing = await db
    .select()
    .from(connectorVersions)
    .where(
      and(
        eq(connectorVersions.connectorId, manifest.connector_id),
        eq(connectorVersions.connectorVersion, manifest.connector_version),
      ),
    )
    .limit(1);
  if (existing[0]) return;
  await db.insert(connectorVersions).values({
    connectorId: manifest.connector_id,
    connectorVersion: manifest.connector_version,
    graphVersion: manifest.graph_version,
    manifest,
  });
}

export async function publishCatalogConnectors(db: Db): Promise<void> {
  await publishManifest(db, manifestPath);
  await publishManifest(db, path.join(path.dirname(manifestPath), "../warehouse_x_receipt/manifest.json"));
}

export async function signUp(
  db: Db,
  email: string,
  password: string,
  role: "catalog" | "author" = "catalog",
): Promise<{ userId: string; tenantId: string }> {
  const normalized = email.trim().toLowerCase();
  const [tenant] = await db.insert(tenants).values({ name: normalized }).returning();
  const authorUntil = role === "author" ? new Date(Date.now() + 24 * 60 * 60 * 1000) : null;
  const [user] = await db
    .insert(portalUsers)
    .values({ tenantId: tenant.id, email: normalized, passwordHash: hashPassword(password), role, authorUntil })
    .returning();
  await publishCatalogConnectors(db);
  const secret = await createApiKey(db, tenant.id, "dashboard");
  await db.update(portalUsers).set({ dashboardKey: encryptVault(secret) }).where(eq(portalUsers.id, user.id));
  return { userId: user.id, tenantId: tenant.id };
}

export function authorIsActive(role: string, authorUntil: Date | null, now = new Date()): boolean {
  if (role !== "author") return false;
  if (!authorUntil) return true;
  return authorUntil.getTime() > now.getTime();
}

export async function loadPortalUser(db: Db, userId: string) {
  const rows = await db.select().from(portalUsers).where(eq(portalUsers.id, userId)).limit(1);
  return rows[0] ?? null;
}

export async function signIn(
  db: Db,
  email: string,
  password: string,
): Promise<{ userId: string; tenantId: string } | null> {
  const rows = await db.select().from(portalUsers).where(eq(portalUsers.email, email.trim().toLowerCase())).limit(1);
  const user = rows[0];
  if (!user || !verifyPassword(password, user.passwordHash)) return null;
  return { userId: user.id, tenantId: user.tenantId };
}

export const MAX_CUSTOMER_KEYS = 5;

export async function userCreatedKeyCount(db: Db, tenantId: string): Promise<number> {
  const rows = await db
    .select({ n: count() })
    .from(apiKeys)
    .where(and(eq(apiKeys.tenantId, tenantId), isNull(apiKeys.revokedAt), sql`${apiKeys.name} <> 'dashboard'`));
  return Number(rows[0]?.n ?? 0);
}

export async function createApiKey(db: Db, tenantId: string, name: string): Promise<string> {
  const secret = `sk_live_${randomBytes(24).toString("hex")}`;
  await db.insert(apiKeys).values({
    tenantId,
    name,
    keyPrefix: secret.slice(0, 12),
    keyHash: hashKey(secret),
    secretCipher: encryptVault(secret),
    scopes: ["jobs:write", "jobs:read"],
  });
  return secret;
}

export async function revealCustomerKey(db: Db, tenantId: string, keyId: string): Promise<string | null> {
  const rows = await db
    .select({ secretCipher: apiKeys.secretCipher })
    .from(apiKeys)
    .where(and(eq(apiKeys.id, keyId), eq(apiKeys.tenantId, tenantId), isNull(apiKeys.revokedAt), sql`${apiKeys.name} <> 'dashboard'`))
    .limit(1);
  const cipher = rows[0]?.secretCipher;
  if (!cipher) return null;
  return decryptVault(cipher);
}

export async function revokeApiKey(db: Db, tenantId: string, keyId: string): Promise<void> {
  await db.delete(apiKeys).where(and(eq(apiKeys.id, keyId), eq(apiKeys.tenantId, tenantId), sql`${apiKeys.name} <> 'dashboard'`));
}

export async function customerKeyMatches(db: Db, tenantId: string, secret: string): Promise<boolean> {
  const token = secret.trim();
  if (!token) return false;
  const rows = await db
    .select({ id: apiKeys.id })
    .from(apiKeys)
    .where(
      and(
        eq(apiKeys.tenantId, tenantId),
        eq(apiKeys.keyHash, hashKey(token)),
        isNull(apiKeys.revokedAt),
        sql`${apiKeys.name} <> 'dashboard'`,
      ),
    )
    .limit(1);
  return Boolean(rows[0]);
}

export async function listApiKeys(db: Db, tenantId: string) {
  return db
    .select({
      id: apiKeys.id,
      name: apiKeys.name,
      keyPrefix: apiKeys.keyPrefix,
      revokedAt: apiKeys.revokedAt,
      hasSecret: isNotNull(apiKeys.secretCipher),
    })
    .from(apiKeys)
    .where(and(eq(apiKeys.tenantId, tenantId), sql`${apiKeys.name} <> 'dashboard'`));
}

export async function usageCounts(db: Db, tenantId: string): Promise<{ cached_read: number; live_run: number }> {
  const rows = await db
    .select({ kind: usageEvents.kind, n: count() })
    .from(usageEvents)
    .where(eq(usageEvents.tenantId, tenantId))
    .groupBy(usageEvents.kind);
  const counts = { cached_read: 0, live_run: 0 };
  for (const row of rows) {
    if (row.kind === "cached_read" || row.kind === "live_run") counts[row.kind] = Number(row.n);
  }
  return counts;
}

export function loadCatalog() {
  const carrier = catalogFromManifest(manifestPath, "Look up a Carrier X shipment and, when you ask for it, a proof-of-delivery file.");
  const warehousePath = path.join(path.dirname(manifestPath), "../warehouse_x_receipt/manifest.json");
  const warehouse = catalogFromManifest(
    warehousePath,
    "Look up whether a warehouse receipt was received.",
  );
  return [carrier, warehouse];
}

function catalogFromManifest(filePath: string, summary: string) {
  const manifest = JSON.parse(readFileSync(filePath, "utf8")) as {
    connector_id: string;
    inputs: Record<string, { type: string; required?: boolean }>;
    outputs: Record<string, { type?: string; enum?: string[]; signed?: boolean }>;
  };
  return {
    id: manifest.connector_id,
    title: manifest.connector_id === "warehouse_x_receipt" ? "Warehouse receipt" : "Shipment tracking",
    summary,
    inputs: Object.entries(manifest.inputs).map(([name, field]) => ({
      name,
      type: field.type,
      required: Boolean(field.required),
      plain:
        name === "tracking_number"
          ? "The shipment number printed on the label."
          : name === "receipt_id"
            ? "The warehouse receipt number."
            : name === "include_pod_document"
              ? "Ask for the proof-of-delivery file as well as the status."
              : name === "destination_zip"
                ? "Postal code, required only when you want the file and you are not using a saved session."
                : "Value sent to the connector.",
    })),
    outputs: Object.entries(manifest.outputs).map(([name, field]) => ({
      name,
      plain:
        name === "status"
          ? `Status: ${(field.enum ?? []).join(", ")}.`
          : name === "document_url"
            ? "A short-lived link to the proof-of-delivery file. It expires in about 15 minutes."
            : "Name of the person who signed, when the site shows one.",
    })),
  };
}

export function quickstartText(base = "http://localhost:3000"): string {
  return [
    "Create an API key in this portal. Use it only from your server, not in a browser.",
    "",
    `curl -s -H "Authorization: Bearer $API_KEY" -H "Content-Type: application/json" \\`,
    `  -d '{"connector_id":"carrier_x_pod","inputs":{"tracking_number":"ABC"}}' \\`,
    `  ${base}/v1/jobs`,
    "",
    `The same call with connector_id warehouse_x_receipt and inputs.receipt_id looks up a warehouse receipt.`,
    "",
    `curl -s -H "Authorization: Bearer $API_KEY" ${base}/v1/jobs/JOB_ID`,
    "",
    `curl -s -H "Authorization: Bearer $API_KEY" ${base}/v1/jobs/JOB_ID/result`,
    "",
    `OpenAPI: ${base}/v1/openapi.json`,
  ].join("\n");
}

export async function activeKeyCount(db: Db, tenantId: string): Promise<number> {
  const rows = await db
    .select({ n: count() })
    .from(apiKeys)
    .where(and(eq(apiKeys.tenantId, tenantId), isNull(apiKeys.revokedAt)));
  return Number(rows[0]?.n ?? 0);
}

export const MAX_CUSTOM_ENDPOINTS = 12;

function slugConnectorId(title: string): string {
  const slug = title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 48);
  return slug ? `custom_${slug}` : "custom_endpoint";
}

export async function listUserEndpoints(db: Db, tenantId: string) {
  const rows = await db.select().from(connectorVersions);
  return rows
    .filter((row) => {
      const manifest = row.manifest as { tenant_id?: string; graph?: unknown; title?: string; description?: string };
      return manifest.tenant_id === tenantId && manifest.graph;
    })
    .map((row) => {
      const manifest = row.manifest as { title?: string; description?: string; start_url?: string };
      return {
        connectorId: row.connectorId,
        title: manifest.title ?? row.connectorId,
        description: manifest.description ?? "",
        startUrl: manifest.start_url ?? "",
        resultUrl: (row.manifest as { result_url?: string }).result_url ?? "",
        pattern: ((row.manifest as { pattern?: string }).pattern ?? "P2") as "P1" | "P2" | "P3",
        inputName: Object.keys((row.manifest as { inputs?: Record<string, unknown> }).inputs ?? {})[0] ?? "",
        outputName: (row.manifest as { output_name?: string }).output_name ?? "result",
        testPassed: (row.manifest as { test_passed?: boolean }).test_passed === true,
        maxResults: Math.min(500, Math.max(1, Number((row.manifest as { max_results?: number }).max_results) || 50)),
      };
    });
}

async function patchEndpointManifest(
  db: Db,
  tenantId: string,
  connectorId: string,
  patch: Record<string, unknown>,
): Promise<boolean> {
  const row = (
    await db.select().from(connectorVersions).where(eq(connectorVersions.connectorId, connectorId)).limit(1)
  )[0];
  if (!row) return false;
  const manifest = row.manifest as { tenant_id?: string };
  if (manifest.tenant_id !== tenantId) return false;
  await db
    .update(connectorVersions)
    .set({ manifest: { ...row.manifest, ...patch } })
    .where(eq(connectorVersions.id, row.id));
  return true;
}

export async function setEndpointTestResult(db: Db, tenantId: string, connectorId: string, passed: boolean): Promise<boolean> {
  return patchEndpointManifest(db, tenantId, connectorId, { test_passed: passed });
}

export async function setEndpointCopy(
  db: Db,
  tenantId: string,
  connectorId: string,
  title: string,
  description: string,
): Promise<boolean> {
  const nextTitle = title.trim();
  if (!nextTitle) return false;
  return patchEndpointManifest(db, tenantId, connectorId, { title: nextTitle, description: description.trim() });
}

export async function setEndpointMaxResults(db: Db, tenantId: string, connectorId: string, maxResults: number): Promise<boolean> {
  const limit = Math.min(500, Math.max(1, Math.floor(maxResults) || 50));
  return patchEndpointManifest(db, tenantId, connectorId, { max_results: limit });
}

export async function userEndpointCount(db: Db, tenantId: string): Promise<number> {
  return (await listUserEndpoints(db, tenantId)).length;
}

function templatizeResultUrl(resultUrl: string, inputName: string, sample: string): string {
  if (!sample) return resultUrl;
  if (resultUrl.includes(sample)) return resultUrl.replaceAll(sample, `{${inputName}}`);
  const encoded = encodeURIComponent(sample);
  if (encoded !== sample && resultUrl.includes(encoded)) return resultUrl.replaceAll(encoded, `{${inputName}}`);
  return resultUrl;
}

function parseMarkedExtract(raw: string): MarkedExtract | null {
  if (!raw.trim()) return null;
  try {
    return JSON.parse(raw) as MarkedExtract;
  } catch {
    return null;
  }
}

function manifestExtract(
  extractJson: string | undefined,
  extractId: string,
  sample: string,
  extractMode?: string,
  listOutputName?: string,
): Record<string, unknown> {
  const marked = parseMarkedExtract(extractJson ?? "");
  if (marked?.kind === "composite") {
    return marked as unknown as Record<string, unknown>;
  }
  if (marked?.kind === "marked_list") {
    const arrayKey = listOutputName?.trim() || "items";
    return {
      kind: "composite",
      blocks: [
        {
          type: "list",
          key: arrayKey,
          row_selector: marked.row_selector,
          fields: marked.fields,
        },
      ],
    };
  }
  if (marked?.kind === "marked_single") {
    const key = listOutputName?.trim() || marked.output_key?.trim() || "value";
    return {
      kind: "composite",
      blocks: [{ type: "scalar", key, selector: marked.selector }],
    };
  }
  if (marked?.kind === "marked_page") {
    return {
      kind: "composite",
      blocks: [{ type: "fields", fields: marked.fields }],
    };
  }
  if (extractMode === "result_list" || extractId === "result_rows") {
    return { kind: "result_rows" };
  }
  return extractFromCandidate(extractId, sample, extractMode === "result_list" ? "result_list" : "single");
}

function extractSpecFromManifest(extract: Record<string, unknown>): ExtractSpec | null {
  if (extract.kind === "composite") {
    return parseExtractSpec(JSON.stringify(extract));
  }
  if (
    extract.kind === "marked_list" ||
    extract.kind === "marked_single" ||
    extract.kind === "marked_page"
  ) {
    return parseExtractSpec(JSON.stringify(extract));
  }
  return null;
}

function isTeachMarkedManifest(extract: Record<string, unknown>): boolean {
  return extract.kind === "composite" || extractSpecFromManifest(extract) !== null;
}

function outputSchemaFromExtract(
  extract: Record<string, unknown>,
  outputName: string,
): Record<string, unknown> {
  const spec = extractSpecFromManifest(extract);
  if (spec) {
    return outputSchemaFromSpec(spec, outputName);
  }
  if (extract.kind === "result_rows") {
    return {
      items: {
        type: "array",
        items: { field_1: { type: "string" }, field_2: { type: "string" }, field_3: { type: "string" } },
      },
    };
  }
  return { [outputName]: { type: "string" } };
}

function outputNameFromExtract(extract: Record<string, unknown>, fallback: string): string {
  const spec = extractSpecFromManifest(extract);
  if (spec) return primaryOutputName(spec, fallback);
  if (extract.kind === "result_rows") return "items";
  return fallback;
}

function extractFromCandidate(
  id: string,
  sample: string,
  mode?: "single" | "result_list",
): { kind: "title" | "h1" | "h2" | "list" | "text" | "main" | "result_rows"; match?: string } {
  if (mode === "result_list" || id === "result_rows") return { kind: "result_rows" };
  if (id === "title") return { kind: "title" };
  if (id.startsWith("h1")) return { kind: "h1" };
  if (id.startsWith("h2")) return { kind: "h2" };
  if (id.startsWith("li")) return { kind: "list" };
  if (sample) return { kind: "text", match: sample.slice(0, 200) };
  return { kind: "main" };
}

export async function publishUserEndpoint(
  db: Db,
  userId: string,
  tenantId: string,
  input: {
    title: string;
    description: string;
    url1: string;
    url2: string;
    pattern: NavigationPattern;
    inputName: string;
    outputName: string;
    sampleOutput?: string;
    extractId?: string;
    extractMode?: "single" | "result_list" | "marked_list" | "marked_single" | "marked_page";
    extractJson?: string;
    templatingSample?: string;
    inputSelector?: string;
    formFieldsJson?: string;
    stagesJson?: string;
    submitSelector?: string;
    requiresSession?: boolean;
    fixedConnectorId?: string;
  },
): Promise<{ ok: true; connectorId: string } | { ok: false; message: string }> {
  const user = await loadPortalUser(db, userId);
  if (!user || user.tenantId !== tenantId) {
    return { ok: false, message: "Account not found" };
  }
  const connectorId = input.fixedConnectorId ?? slugConnectorId(input.title);
  const existingRow = await db
    .select()
    .from(connectorVersions)
    .where(and(eq(connectorVersions.connectorId, connectorId), eq(connectorVersions.connectorVersion, "1.0.0")))
    .limit(1);
  if (!existingRow[0] && (await userEndpointCount(db, tenantId)) >= MAX_CUSTOM_ENDPOINTS) {
    return { ok: false, message: "Endpoint limit reached" };
  }
  const kind = input.inputName === "page" || input.url1 === input.url2 ? ("read" as const) : ("lookup" as const);
  const apiInput = kind === "read" ? "" : input.inputName === "page" ? "query" : input.inputName;
  const sample = (input.sampleOutput ?? "").trim();
  const templating = (input.templatingSample ?? sample).trim();
  const extract = manifestExtract(
    input.extractJson,
    input.extractId ?? "main",
    sample,
    input.extractMode,
    input.outputName,
  );
  const publishedOutputName = outputNameFromExtract(extract, input.outputName);
  let formFields: Array<{ key: string; selector: string }> = [];
  try {
    formFields = JSON.parse(input.formFieldsJson ?? "[]") as Array<{ key: string; selector: string }>;
  } catch {
    formFields = [];
  }
  let stages: Array<{ url: string; fields: Array<{ key: string; selector: string }>; clickSelector?: string }> = [];
  try {
    const parsed = JSON.parse(input.stagesJson ?? "[]") as typeof stages;
    if (Array.isArray(parsed)) stages = parsed.filter((stage) => stage && typeof stage.url === "string");
  } catch {
    stages = [];
  }
  const teachMarked = isTeachMarkedManifest(extract);
  if (teachMarked) {
    const spec = extractSpecFromManifest(extract);
    if (!spec || !compositeReady(normalizeToComposite(spec))) {
      return { ok: false, message: "Finish mapping outputs on the result page before publishing." };
    }
  }
  const inputSchema =
    kind === "read"
      ? {}
      : Object.fromEntries(
          (formFields.length ? formFields : [{ key: apiInput || "query" }]).map((field) => [
            field.key,
            { type: "string", required: true },
          ]),
        );
  const resultUrl = kind === "read" ? input.url1 : templatizeResultUrl(input.url2, apiInput || "query", templating);
  const waitSelector = waitSelectorFromExtract(extract);
  const graph = teachMarked
    ? compileTeachGraph({
        startUrl: input.url1,
        resultUrl,
        kind,
        pattern: input.pattern,
        formFields,
        submitSelector: input.submitSelector?.trim() || undefined,
        waitSelector,
        stages: stages.length ? stages : undefined,
      })
    : compileStudioGraph({ ...input, kind, url2: resultUrl });
  if (!teachMarked) {
    const chosen = replayStudioGraph(graph, input.pattern);
    const other = replayStudioGraph(graph, input.pattern === "P2" ? "P3" : "P2");
    if (!chosen.ok || other.ok) {
      return { ok: false, message: "Teaching replay failed. Check the result page URL and how the site behaves after submit." };
    }
  }
  const connectorVersion = "1.0.0";
  const manifest = {
    connector_id: connectorId,
    connector_version: connectorVersion,
    graph_version: STUDIO_GRAPH_VERSION,
    tenant_id: tenantId,
    title: input.title,
    description: input.description,
    start_url: input.url1,
    result_url: resultUrl,
    kind,
    pattern: input.pattern,
    output_name: publishedOutputName,
    sample_output: sample.slice(0, 2000),
    extract,
    input_selector: input.inputSelector?.trim() || undefined,
    form_fields: formFields.length ? formFields : undefined,
    submit_selector: input.submitSelector?.trim() || undefined,
    requires_session: input.requiresSession === true ? true : undefined,
    inputs: inputSchema,
    outputs: outputSchemaFromExtract(extract, input.outputName),
    graph,
    max_results: Math.min(
      500,
      Math.max(1, Number((existingRow[0]?.manifest as { max_results?: number } | undefined)?.max_results) || 50),
    ),
    test_passed: false,
  };
  const existing = existingRow;
  if (existing[0]) {
    await db
      .update(connectorVersions)
      .set({ graphVersion: STUDIO_GRAPH_VERSION, manifest })
      .where(eq(connectorVersions.id, existing[0].id));
  } else {
    await db.insert(connectorVersions).values({
      connectorId,
      connectorVersion,
      graphVersion: STUDIO_GRAPH_VERSION,
      manifest,
    });
  }
  const vault = await db
    .select()
    .from(vaultSessions)
    .where(
      and(eq(vaultSessions.tenantId, tenantId), eq(vaultSessions.connectorId, connectorId), eq(vaultSessions.sessionId, "default")),
    )
    .limit(1);
  if (!vault[0]) {
    await db.insert(vaultSessions).values({
      tenantId,
      connectorId,
      sessionId: "default",
      encryptedStorageState: encryptVault(JSON.stringify({ cookies: [], origins: [], tenantId })),
    });
    await db.insert(auditLog).values({
      tenantId,
      actorType: "portal_user",
      actorId: userId,
      action: "vault_onboarding",
      resourceType: "vault_session",
      resourceId: `${tenantId}:${connectorId}:default`,
    });
  }
  return { ok: true, connectorId };
}

export async function deleteUserEndpoint(db: Db, tenantId: string, connectorId: string): Promise<boolean> {
  const mine = await listUserEndpoints(db, tenantId);
  if (!mine.some((row) => row.connectorId === connectorId)) return false;
  await db.delete(vaultSessions).where(and(eq(vaultSessions.tenantId, tenantId), eq(vaultSessions.connectorId, connectorId)));
  await db.delete(connectorVersions).where(eq(connectorVersions.connectorId, connectorId));
  return true;
}

export async function publishStudioConnector(
  db: Db,
  userId: string,
  tenantId: string,
  input: { url1: string; url2: string; pattern: NavigationPattern; inputName: string; outputName: string },
): Promise<{ ok: true; connectorId: string } | { ok: false; message: string }> {
  return publishUserEndpoint(db, userId, tenantId, {
    title: "My tracking endpoint",
    fixedConnectorId: STUDIO_CONNECTOR_ID,
    description: "Published from Studio",
    ...input,
  });
}

export async function listPendingRepairs(db: Db, tenantId: string) {
  return db.select().from(graphRepairs).where(and(eq(graphRepairs.tenantId, tenantId), eq(graphRepairs.status, "pending")));
}

export async function approveRepair(
  db: Db,
  userId: string,
  repairId: string,
): Promise<{ ok: true; graphVersion: string; connectorVersion: string } | { ok: false; message: string }> {
  const user = await loadPortalUser(db, userId);
  if (!user || (user.role !== "admin" && !authorIsActive(user.role, user.authorUntil))) {
    return { ok: false, message: "Studio is limited to authors" };
  }
  const repairs = await db.select().from(graphRepairs).where(eq(graphRepairs.id, repairId)).limit(1);
  const repair = repairs[0];
  if (!repair || repair.status !== "pending") {
    return { ok: false, message: "Repair not found" };
  }
  if (user.role !== "admin" && repair.tenantId !== user.tenantId) {
    return { ok: false, message: "Repair not found" };
  }
  const published = await db
    .select()
    .from(connectorVersions)
    .where(
      and(eq(connectorVersions.connectorId, repair.connectorId), eq(connectorVersions.connectorVersion, repair.connectorVersion)),
    )
    .limit(1);
  const row = published[0];
  if (!row) return { ok: false, message: "Published connector not found" };
  let replayOk = false;
  if (repair.connectorId === "warehouse_x_receipt") {
    replayOk = runWarehouseFixture(loadWarehouseFixture("found")).jobStatus === "succeeded";
  } else if (repair.connectorId === STUDIO_CONNECTOR_ID || (row.manifest as { graph?: unknown }).graph) {
    const graph = (row.manifest as { graph?: unknown; pattern?: "P1" | "P2" | "P3" }).graph;
    const pattern = (row.manifest as { pattern?: "P1" | "P2" | "P3" }).pattern ?? "P2";
    replayOk = Boolean(graph && replayStudioGraph(loadGraph(graph), pattern).ok);
  } else {
    replayOk = runCarrierFixture(loadCarrierFixture("in_transit")).jobStatus === "succeeded";
  }
  if (!replayOk) return { ok: false, message: "Staging replay failed" };
  const diff = repair.proposedDiff as { graph_version: string };
  const manifest = { ...(row.manifest as Record<string, unknown>), graph_version: diff.graph_version };
  await db
    .update(connectorVersions)
    .set({ graphVersion: diff.graph_version, manifest })
    .where(eq(connectorVersions.id, row.id));
  await db.update(graphRepairs).set({ status: "approved" }).where(eq(graphRepairs.id, repair.id));
  return { ok: true, graphVersion: diff.graph_version, connectorVersion: row.connectorVersion };
}
