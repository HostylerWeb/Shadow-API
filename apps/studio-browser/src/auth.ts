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

export function mintStudioToken(claims: Omit<StudioClaims, "exp">, ttlSeconds = 3600): string {
  const body = Buffer.from(JSON.stringify({ ...claims, exp: Math.floor(Date.now() / 1000) + ttlSeconds })).toString(
    "base64url",
  );
  const mac = createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${mac}`;
}

export function verifyStudioToken(token: string): StudioClaims | null {
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;
  const expected = createHmac("sha256", secret()).update(body).digest("base64url");
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const claims = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as StudioClaims;
  if (claims.exp < Math.floor(Date.now() / 1000)) return null;
  return claims;
}
