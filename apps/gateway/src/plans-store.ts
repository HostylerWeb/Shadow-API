import { eq } from "drizzle-orm";
import type { TenantPlan } from "@shadowapi/core";
import type { Db } from "@shadowapi/db";
import { tenants } from "@shadowapi/db/schema";

export async function setTenantPlan(db: Db, tenantId: string, plan: TenantPlan): Promise<void> {
  await db.update(tenants).set({ plan }).where(eq(tenants.id, tenantId));
}
