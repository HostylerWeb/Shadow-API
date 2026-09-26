/**
 * Clear jobs and delete all custom endpoints for teach-browser-test@example.com
 */
import { createDb } from "@shadowapi/db";
import { deleteUserEndpoint, listUserEndpoints, signIn } from "../../portal/src/accounts.js";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL required");
  process.env.PORTAL_SESSION_SECRET ??= "dev-portal-session-secret";

  const { db, close } = createDb(databaseUrl);
  const session = await signIn(db, "teach-browser-test@example.com", "password-123");
  if (!session) throw new Error("Sign in failed");

  const endpoints = await listUserEndpoints(db, session.tenantId);
  let deleted = 0;
  for (const row of endpoints) {
    if (await deleteUserEndpoint(db, session.tenantId, row.connectorId)) deleted += 1;
  }
  await close();
  console.log(JSON.stringify({ tenantId: session.tenantId, deletedEndpoints: deleted }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
