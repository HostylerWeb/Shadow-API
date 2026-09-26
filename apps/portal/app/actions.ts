import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createDb } from "@shadowapi/db";
import { createApiKey, loadPortalUser, publishStudioConnector, revokeApiKey, signIn, signUp, approveRepair } from "../src/accounts";
import { readSession, signSession } from "../src/session";

function db() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  return createDb(url);
}

async function session() {
  const token = (await cookies()).get("portal_session")?.value;
  return readSession(token);
}

export async function signupAction(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const handle = db();
  try {
    const user = await signUp(handle.db, email, password, formData.get("author") === "on" ? "author" : "catalog");
    (await cookies()).set("portal_session", signSession(user), { httpOnly: true, sameSite: "lax", path: "/" });
    await handle.close();
  } catch (error) {
    await handle.close();
    const code = (error as { cause?: { code?: string } }).cause?.code ?? (error as { code?: string }).code;
    redirect(code === "23505" ? "/signup?error=1" : "/signup?error=2");
  }
  redirect("/endpoints");
}

export async function loginAction(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const handle = db();
  const user = await signIn(handle.db, email, password);
  if (!user) {
    await handle.close();
    redirect("/login?error=1");
  }
  const row = await loadPortalUser(handle.db, user.userId);
  (await cookies()).set("portal_session", signSession(user), { httpOnly: true, sameSite: "lax", path: "/" });
  await handle.close();
  redirect(row?.role === "admin" ? "/admin" : "/endpoints");
}

export async function createKeyAction(formData: FormData) {
  "use server";
  const current = await session();
  if (!current) redirect("/login");
  const name = String(formData.get("name") ?? "server").trim() || "server";
  if (name.toLowerCase() === "dashboard") redirect("/keys?error=reserved");
  const handle = db();
  const { userCreatedKeyCount, MAX_CUSTOMER_KEYS } = await import("../src/accounts");
  if ((await userCreatedKeyCount(handle.db, current.tenantId)) >= MAX_CUSTOMER_KEYS) {
    await handle.close();
    redirect("/keys?error=limit");
  }
  const secret = await createApiKey(handle.db, current.tenantId, name);
  await handle.close();
  (await cookies()).set("portal_key_once", secret, { httpOnly: true, sameSite: "lax", path: "/keys", maxAge: 120 });
  redirect("/keys");
}

export async function dismissKeyAction() {
  "use server";
  (await cookies()).delete("portal_key_once");
  redirect("/keys");
}

export async function revealKeyAction(keyId: string): Promise<string | null> {
  "use server";
  const current = await session();
  if (!current) return null;
  const handle = db();
  const { revealCustomerKey } = await import("../src/accounts");
  const secret = await revealCustomerKey(handle.db, current.tenantId, keyId);
  await handle.close();
  return secret;
}

export async function revokeKeyAction(formData: FormData) {
  "use server";
  const current = await session();
  if (!current) redirect("/login");
  const handle = db();
  await revokeApiKey(handle.db, current.tenantId, String(formData.get("id") ?? ""));
  await handle.close();
  redirect("/keys");
}

export async function requireSession() {
  const current = await session();
  if (!current) redirect("/login");
  return current;
}

export async function publishStudioAction(formData: FormData) {
  "use server";
  const current = await session();
  if (!current) redirect("/login");
  const pattern = String(formData.get("pattern") ?? "P2");
  if (pattern !== "P1" && pattern !== "P2" && pattern !== "P3") redirect("/endpoints/new/record?error=1");
  const handle = db();
  const result = await publishStudioConnector(handle.db, current.userId, current.tenantId, {
    url1: String(formData.get("url1") ?? ""),
    url2: String(formData.get("url2") ?? ""),
    pattern,
    inputName: String(formData.get("inputName") ?? "query"),
    outputName: String(formData.get("outputName") ?? "result"),
  });
  await handle.close();
  if (!result.ok) redirect("/endpoints/new/record?error=1");
  redirect("/endpoints?published=1");
}

export async function previewPageAction(pageUrl: string) {
  "use server";
  const current = await session();
  if (!current) return null;
  const { snapshotPublicPage } = await import("../src/page-snapshot.js");
  return snapshotPublicPage(pageUrl.trim());
}

export async function publishEndpointAction(formData: FormData) {
  "use server";
  const current = await session();
  if (!current) redirect("/login");
  const url1 = String(formData.get("url1") ?? "");
  const mode = String(formData.get("mode") ?? "lookup");
  const pattern = mode === "read" ? "P1" : String(formData.get("pattern") ?? "P2");
  const url2 = mode === "read" ? url1 : String(formData.get("url2") ?? "");
  const inputName = mode === "read" ? "page" : String(formData.get("inputName") ?? "").trim() || "query";
  if (pattern !== "P1" && pattern !== "P2" && pattern !== "P3") {
    redirect(`/endpoints/new/record?error=1&title=${encodeURIComponent(String(formData.get("title") ?? ""))}&description=${encodeURIComponent(String(formData.get("description") ?? ""))}&url=${encodeURIComponent(url1)}`);
  }
  const handle = db();
  const { publishUserEndpoint } = await import("../src/accounts.js");
  const result = await publishUserEndpoint(handle.db, current.userId, current.tenantId, {
    title: String(formData.get("title") ?? ""),
    description: String(formData.get("description") ?? ""),
    url1,
    url2,
    pattern,
    inputName,
    outputName: String(formData.get("outputName") ?? "result"),
    sampleOutput: String(formData.get("sampleOutput") ?? ""),
    extractId: String(formData.get("extractId") ?? "main"),
    extractMode: String(formData.get("extractMode") ?? "single") as
      | "single"
      | "result_list"
      | "marked_list"
      | "marked_single"
      | "marked_page",
    extractJson: String(formData.get("extractJson") ?? ""),
    templatingSample: String(formData.get("templatingSample") ?? ""),
    inputSelector: String(formData.get("inputSelector") ?? ""),
    formFieldsJson: String(formData.get("formFieldsJson") ?? "[]"),
    stagesJson: String(formData.get("stagesJson") ?? "[]"),
    submitSelector: String(formData.get("submitSelector") ?? ""),
    requiresSession: String(formData.get("requiresSession") ?? "") === "1",
    fixedConnectorId: String(formData.get("connectorId") ?? "").trim() || undefined,
  });
  await handle.close();
  if (!result.ok) {
    redirect(`/endpoints/new/record?error=1&title=${encodeURIComponent(String(formData.get("title") ?? ""))}&description=${encodeURIComponent(String(formData.get("description") ?? ""))}&url=${encodeURIComponent(String(formData.get("url1") ?? ""))}`);
  }
  redirect(`/endpoints/test?connector=${encodeURIComponent(result.connectorId)}&published=1`);
}

export async function confirmEndpointTestAction(formData: FormData) {
  "use server";
  const current = await session();
  if (!current) redirect("/login");
  const connectorId = String(formData.get("connector_id") ?? "");
  const passed = String(formData.get("passed") ?? "") === "yes";
  const handle = db();
  const { setEndpointTestResult } = await import("../src/accounts.js");
  await setEndpointTestResult(handle.db, current.tenantId, connectorId, passed);
  await handle.close();
  if (!passed) redirect(`/endpoints/${encodeURIComponent(connectorId)}/edit`);
  redirect("/endpoints?ready=1");
}

export async function renameEndpointAction(formData: FormData) {
  "use server";
  const current = await session();
  if (!current) redirect("/login");
  const handle = db();
  const { setEndpointCopy } = await import("../src/accounts.js");
  await setEndpointCopy(
    handle.db,
    current.tenantId,
    String(formData.get("connector_id") ?? ""),
    String(formData.get("title") ?? ""),
    String(formData.get("description") ?? ""),
  );
  await handle.close();
  redirect("/endpoints");
}

export async function setEndpointLimitAction(formData: FormData) {
  "use server";
  const current = await session();
  if (!current) redirect("/login");
  const connectorId = String(formData.get("connector_id") ?? "");
  const maxResults = Number(formData.get("max_results") ?? "50");
  const handle = db();
  const { setEndpointMaxResults } = await import("../src/accounts.js");
  await setEndpointMaxResults(handle.db, current.tenantId, connectorId, maxResults);
  await handle.close();
  redirect("/endpoints?limit=1");
}

export async function deleteEndpointAction(formData: FormData) {
  "use server";
  const current = await session();
  if (!current) redirect("/login");
  const handle = db();
  const { deleteUserEndpoint } = await import("../src/accounts.js");
  await deleteUserEndpoint(handle.db, current.tenantId, String(formData.get("connector_id") ?? ""));
  await handle.close();
  redirect("/endpoints");
}

export async function approveRepairAction(formData: FormData) {
  "use server";
  const current = await session();
  if (!current) redirect("/login");
  const handle = db();
  const back = String(formData.get("next") ?? "/repairs");
  const result = await approveRepair(handle.db, current.userId, String(formData.get("id") ?? ""));
  await handle.close();
  if (!result.ok) redirect(back === "/admin/repairs" ? "/admin/repairs?error=1" : "/repairs?error=1");
  redirect(back === "/admin/repairs" ? "/admin/repairs?approved=1" : "/repairs?approved=1");
}

export async function signOutAction() {
  "use server";
  (await cookies()).delete("portal_session");
  redirect("/login");
}

export async function setPlanAction(formData: FormData) {
  "use server";
  const current = await session();
  if (!current) redirect("/login");
  const handle = db();
  const { dashboardSecret } = await import("../src/dashboard");
  const secret = await dashboardSecret(handle.db, current.userId);
  await handle.close();
  const plan = String(formData.get("plan") ?? "");
  const res = await fetch(`${process.env.GATEWAY_URL ?? "http://localhost:3000"}/v1/billing/plan`, {
    method: "POST",
    headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
    body: JSON.stringify({ plan }),
  });
  redirect(res.ok ? "/usage" : "/usage?error=1");
}

export async function runJobAction(formData: FormData) {
  "use server";
  const current = await session();
  if (!current) redirect("/login");
  const handle = db();
  const { customerKeyMatches } = await import("../src/accounts.js");
  const secret = String(formData.get("api_key") ?? "").trim();
  const connectorId = String(formData.get("connector_id") ?? "");
  const ownsKey = await customerKeyMatches(handle.db, current.tenantId, secret);
  await handle.close();
  if (!ownsKey) {
    redirect(
      `/endpoints/test?error=1&connector=${encodeURIComponent(connectorId)}&reason=${encodeURIComponent("Paste an API key from the API keys page. The portal test uses that key, not a hidden one.")}`,
    );
  }
  const inputs: Record<string, string | boolean> = {};
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("input_")) continue;
    const text = String(value).trim();
    if (!text) continue;
    inputs[key.slice(6)] = key === "input_include_pod_document" ? text === "true" : text;
  }
  const sessionId = String(formData.get("session_id") ?? "").trim();
  const payload: Record<string, unknown> = { connector_id: connectorId, inputs };
  if (sessionId) payload.session_id = sessionId;
  const res = await fetch(`${process.env.GATEWAY_URL ?? "http://localhost:3000"}/v1/jobs`, {
    method: "POST",
    headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = (await res.json().catch(() => ({}))) as { job_id?: string; failure?: { message?: string } };
  if (!body.job_id) {
    const reason = body.failure?.message ?? "";
    redirect(
      `/endpoints/test?error=1&connector=${encodeURIComponent(connectorId)}${reason ? `&reason=${encodeURIComponent(reason)}` : ""}`,
    );
  }
  redirect(`/jobs/${body.job_id}`);
}

export async function cancelJobAction(formData: FormData) {
  "use server";
  const current = await session();
  if (!current) redirect("/login");
  const handle = db();
  const { dashboardSecret } = await import("../src/dashboard");
  const secret = await dashboardSecret(handle.db, current.userId);
  await handle.close();
  const id = String(formData.get("id") ?? "");
  await fetch(`${process.env.GATEWAY_URL ?? "http://localhost:3000"}/v1/jobs/${id}`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${secret}` },
  });
  redirect(`/jobs/${id}`);
}

export async function adminPlanAction(formData: FormData) {
  "use server";
  const current = await session();
  if (!current) redirect("/login");
  const handle = db();
  const { requireAdmin } = await import("../src/admin");
  const admin = await requireAdmin(handle.db, current.userId);
  if (!admin) {
    await handle.close();
    redirect("/endpoints");
  }
  const { setTenantPlan } = await import("../../gateway/src/plans-store.ts");
  await setTenantPlan(handle.db, String(formData.get("tenantId") ?? ""), String(formData.get("plan") ?? "developer") as "developer");
  const tenantId = String(formData.get("tenantId") ?? "");
  await handle.close();
  redirect(formData.get("next") === "detail" ? `/admin/tenants/${tenantId}` : "/admin/tenants");
}

export async function adminRoleAction(formData: FormData) {
  "use server";
  const current = await session();
  if (!current) redirect("/login");
  const handle = db();
  const { requireAdmin } = await import("../src/admin");
  const admin = await requireAdmin(handle.db, current.userId);
  const tenantId = String(formData.get("tenantId") ?? "");
  const role = String(formData.get("role") ?? "catalog");
  if (!admin || (role !== "catalog" && role !== "author") || tenantId === admin.tenantId) {
    await handle.close();
    redirect("/admin/tenants");
  }
  const { portalUsers } = await import("@shadowapi/db/schema");
  const { eq } = await import("drizzle-orm");
  const authorUntil = role === "author" ? new Date(Date.now() + 24 * 60 * 60 * 1000) : null;
  await handle.db.update(portalUsers).set({ role, authorUntil }).where(eq(portalUsers.tenantId, tenantId));
  await handle.close();
  redirect(`/admin/tenants/${tenantId}`);
}

export async function adminRevokeKeyAction(formData: FormData) {
  "use server";
  const current = await session();
  if (!current) redirect("/login");
  const handle = db();
  const { requireAdmin } = await import("../src/admin");
  const admin = await requireAdmin(handle.db, current.userId);
  const tenantId = String(formData.get("tenantId") ?? "");
  const keyId = String(formData.get("id") ?? "");
  if (!admin) {
    await handle.close();
    redirect("/endpoints");
  }
  const { apiKeys } = await import("@shadowapi/db/schema");
  const { and, eq } = await import("drizzle-orm");
  const row = (await handle.db.select().from(apiKeys).where(and(eq(apiKeys.id, keyId), eq(apiKeys.tenantId, tenantId))).limit(1))[0];
  if (row && row.name !== "dashboard") {
    await revokeApiKey(handle.db, tenantId, keyId);
  }
  await handle.close();
  redirect(`/admin/tenants/${tenantId}`);
}

export async function adminDeleteTenantAction(formData: FormData) {
  "use server";
  const current = await session();
  if (!current) redirect("/login");
  const handle = db();
  const { requireAdmin } = await import("../src/admin");
  const admin = await requireAdmin(handle.db, current.userId);
  const tenantId = String(formData.get("tenantId") ?? "");
  if (!admin || tenantId === admin.tenantId) {
    await handle.close();
    redirect("/admin/tenants");
  }
  const { tenants } = await import("@shadowapi/db/schema");
  const { eq } = await import("drizzle-orm");
  await handle.db.delete(tenants).where(eq(tenants.id, tenantId));
  await handle.close();
  redirect("/admin/tenants");
}

export async function adminCancelJobAction(formData: FormData) {
  "use server";
  const current = await session();
  if (!current) redirect("/login");
  const handle = db();
  const { requireAdmin } = await import("../src/admin");
  const admin = await requireAdmin(handle.db, current.userId);
  const id = String(formData.get("id") ?? "");
  if (!admin) {
    await handle.close();
    redirect("/endpoints");
  }
  const { jobs } = await import("@shadowapi/db/schema");
  const { eq } = await import("drizzle-orm");
  const { assertTransition, isTerminalStatus } = await import("@shadowapi/core");
  const job = (await handle.db.select().from(jobs).where(eq(jobs.id, id)).limit(1))[0];
  if (job && !isTerminalStatus(job.status)) {
    assertTransition(job.status, "cancelled");
    await handle.db.update(jobs).set({ status: "cancelled", updatedAt: new Date(), completedAt: new Date() }).where(eq(jobs.id, id));
  }
  await handle.close();
  redirect(`/admin/jobs/${id}`);
}
