import { randomBytes, scryptSync } from "node:crypto";
import { eq } from "drizzle-orm";
import { createDb } from "./client.js";
import { portalUsers, tenants } from "./schema.js";

const url = process.env.DATABASE_URL ?? "postgres://shadowapi:shadowapi@localhost:5436/shadowapi";

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 32).toString("hex");
  return `${salt}:${hash}`;
}

const { db, close } = createDb(url);

async function upsertPortalUser(email: string, password: string, role: "admin" | "catalog", tenantName: string) {
  const normalized = email.trim().toLowerCase();
  const existing = await db.select().from(portalUsers).where(eq(portalUsers.email, normalized)).limit(1);
  const passwordHash = hashPassword(password);
  if (existing[0]) {
    await db.update(portalUsers).set({ role, passwordHash }).where(eq(portalUsers.id, existing[0].id));
    console.log("Updated portal user:", normalized, role);
    return;
  }
  const [tenant] = await db.insert(tenants).values({ name: tenantName }).returning();
  await db.insert(portalUsers).values({
    tenantId: tenant.id,
    email: normalized,
    passwordHash,
    role,
  });
  console.log("Created portal user:", normalized, role, "tenant:", tenant.id);
}

const adminEmail = process.env.PORTAL_ADMIN_EMAIL ?? process.env.ADMIN_EMAIL;
const adminPassword = process.env.PORTAL_ADMIN_PASSWORD ?? process.env.ADMIN_PASSWORD;
const customerEmail = process.env.PORTAL_CUSTOMER_EMAIL;
const customerPassword = process.env.PORTAL_CUSTOMER_PASSWORD;

if (adminEmail && adminPassword) {
  await upsertPortalUser(adminEmail, adminPassword, "admin", "Platform");
}
if (customerEmail && customerPassword) {
  await upsertPortalUser(customerEmail, customerPassword, "catalog", customerEmail);
}

await close();

if (!adminEmail && !customerEmail) {
  console.log("Set PORTAL_ADMIN_EMAIL/PORTAL_ADMIN_PASSWORD and/or PORTAL_CUSTOMER_EMAIL/PORTAL_CUSTOMER_PASSWORD (or ADMIN_*).");
}
