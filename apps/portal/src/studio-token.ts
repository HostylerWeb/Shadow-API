import { createHmac, timingSafeEqual } from "node:crypto";

export type StudioClaims = {
  tenantId: string;
  userId: string;
  exp: number;
};

function secret(): string {
  const value = process.env.STUDIO_BROWSER_SECRET;
  if (!value) throw new Error("STUDIO_BROWSER_SECRET is required");
  return value;
}

export function mintStudioToken(claims: { tenantId: string; userId: string }, ttlSeconds = 3600): string {
  const body = Buffer.from(
    JSON.stringify({ ...claims, exp: Math.floor(Date.now() / 1000) + ttlSeconds }),
  ).toString("base64url");
  const mac = createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${mac}`;
}

export function studioBrowserConfigured(): boolean {
  return Boolean(process.env.STUDIO_BROWSER_URL && process.env.STUDIO_BROWSER_SECRET);
}
