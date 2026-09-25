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
  const user = await signUp(handle.db, email, password, formData.get("author") === "on" ? "author" : "catalog");
  (await cookies()).set("portal_session", signSession(user), { httpOnly: true, sameSite: "lax", path: "/" });
  await handle.close();
  redirect("/keys");
}

export async function loginAction(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const handle = db();
  const user = await signIn(handle.db, email, password);
  await handle.close();
  if (!user) redirect("/login?error=1");
  (await cookies()).set("portal_session", signSession(user), { httpOnly: true, sameSite: "lax", path: "/" });
  redirect("/keys");
}

export async function createKeyAction(formData: FormData) {
  "use server";
  const current = await session();
  if (!current) redirect("/login");
  const name = String(formData.get("name") ?? "default");
  const handle = db();
  const secret = await createApiKey(handle.db, current.tenantId, name);
  await handle.close();
  redirect(`/keys?created=${encodeURIComponent(secret)}`);
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
  if (pattern !== "P1" && pattern !== "P2" && pattern !== "P3") redirect("/studio?error=1");
  const handle = db();
  const result = await publishStudioConnector(handle.db, current.userId, current.tenantId, {
    url1: String(formData.get("url1") ?? ""),
    url2: String(formData.get("url2") ?? ""),
    pattern,
    inputName: String(formData.get("inputName") ?? "tracking_number"),
    outputName: String(formData.get("outputName") ?? "status"),
  });
  await handle.close();
  if (!result.ok) redirect("/studio?error=1");
  redirect("/studio?published=1");
}

export async function approveRepairAction(formData: FormData) {
  "use server";
  const current = await session();
  if (!current) redirect("/login");
  const handle = db();
  const result = await approveRepair(handle.db, current.userId, String(formData.get("id") ?? ""));
  await handle.close();
  if (!result.ok) redirect("/repairs?error=1");
  redirect("/repairs?approved=1");
}
