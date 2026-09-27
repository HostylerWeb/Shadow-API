import { createHash, randomBytes } from "node:crypto";
import { eq } from "@shadowapi/db";
import type { Db } from "@shadowapi/db";
import { portalPasswordResets, portalUsers } from "@shadowapi/db/schema";
import { hashPassword } from "./accounts";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createPasswordReset(db: Db, email: string): Promise<string | null> {
  const normalized = email.trim().toLowerCase();
  const user = (await db.select().from(portalUsers).where(eq(portalUsers.email, normalized)).limit(1))[0];
  if (!user) return null;
  const token = randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
  await db.insert(portalPasswordResets).values({
    userId: user.id,
    tokenHash: hashToken(token),
    expiresAt,
  });
  if (process.env.SMTP_LOG_RESET === "1") {
    console.log(`[portal] password reset link token for ${normalized}: ${token}`);
  }
  return token;
}

export async function resetPasswordWithToken(db: Db, token: string, newPassword: string): Promise<boolean> {
  const hash = hashToken(token);
  const row = (
    await db
      .select()
      .from(portalPasswordResets)
      .where(eq(portalPasswordResets.tokenHash, hash))
      .limit(1)
  )[0];
  if (!row || row.expiresAt.getTime() < Date.now()) return false;
  await db
    .update(portalUsers)
    .set({ passwordHash: hashPassword(newPassword) })
    .where(eq(portalUsers.id, row.userId));
  await db.delete(portalPasswordResets).where(eq(portalPasswordResets.id, row.id));
  return true;
}
