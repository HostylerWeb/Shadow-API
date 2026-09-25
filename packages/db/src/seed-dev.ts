import { createHash, randomBytes } from "node:crypto";
import { createDb } from "./client.js";
import { apiKeys, tenants } from "./schema.js";

const url = process.env.DATABASE_URL ?? "postgres://shadowapi:shadowapi@localhost:5433/shadowapi";

function hashKey(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

const { db, close } = createDb(url);

const secret = process.env.DEV_API_KEY ?? `sk_dev_${randomBytes(24).toString("hex")}`;
const prefix = secret.slice(0, 12);

const [tenant] = await db
  .insert(tenants)
  .values({ name: "Development Tenant" })
  .returning();

await db.insert(apiKeys).values({
  tenantId: tenant.id,
  name: "Development key",
  keyPrefix: prefix,
  keyHash: hashKey(secret),
  scopes: ["jobs:write", "jobs:read"],
});

await close();

console.log("Dev tenant id:", tenant.id);
console.log("Dev API key (Bearer):", secret);
