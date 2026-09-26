import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { readSession } from "../src/session";

export default async function IndexPage() {
  const token = (await cookies()).get("portal_session")?.value;
  redirect(readSession(token) ? "/endpoints" : "/login");
}
