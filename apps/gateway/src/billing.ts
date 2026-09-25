import type { FastifyInstance } from "fastify";
import type { Db } from "@shadowapi/db";
import type { TenantPlan } from "@shadowapi/core";
import { setTenantPlan } from "./plans-store.js";

const PLANS: TenantPlan[] = ["developer", "agency", "enterprise"];

export { setTenantPlan };

export function registerBillingRoutes(app: FastifyInstance, db: Db): void {
  app.post<{ Body: { plan?: string } }>("/v1/billing/plan", async (request, reply) => {
    const plan = request.body?.plan;
    if (!plan || !PLANS.includes(plan as TenantPlan)) {
      return reply.code(400).send({ failure: { code: "VALIDATION_ERROR", message: "plan is required" } });
    }
    const tenantId = request.auth?.tenantId;
    if (!tenantId) {
      return reply.code(401).send({ failure: { code: "VALIDATION_ERROR", message: "Missing Bearer API key" } });
    }
    await setTenantPlan(db, tenantId, plan as TenantPlan);
    return { plan };
  });
}
