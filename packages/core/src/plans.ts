export const LIVE_CAPS = {
  developer: 10,
  agency: 100,
  enterprise: 1000,
} as const;

export type TenantPlan = keyof typeof LIVE_CAPS;

export function liveCap(plan: string): number {
  if (plan in LIVE_CAPS) return LIVE_CAPS[plan as TenantPlan];
  return LIVE_CAPS.developer;
}
