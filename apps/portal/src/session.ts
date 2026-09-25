import { createHmac, timingSafeEqual } from "node:crypto";

export type Session = { userId: string; tenantId: string };

function secret(): string {
  const value = process.env.PORTAL_SESSION_SECRET;
  if (!value) throw new Error("PORTAL_SESSION_SECRET is required");
  return value;
}

export function signSession(session: Session): string {
  const body = Buffer.from(JSON.stringify(session)).toString("base64url");
  const mac = createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${mac}`;
}

export function readSession(token: string | undefined): Session | null {
  if (!token) return null;
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;
  const expected = createHmac("sha256", secret()).update(body).digest("base64url");
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Session;
}
