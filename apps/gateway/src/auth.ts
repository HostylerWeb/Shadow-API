import { createHash } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import type { Db } from "@shadowapi/db";
import { apiKeys } from "@shadowapi/db/schema";

export type AuthContext = {
  tenantId: string;
  apiKeyId: string;
  keyName: string;
  scopes: string[];
};

function hashKey(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

function parseBearer(header: string | undefined): string | null {
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length).trim() || null;
}

export async function authenticateRequest(
  db: Db,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<AuthContext | null> {
  const token = parseBearer(request.headers.authorization);
  if (!token) {
    reply.code(401).send({
      failure: { code: "VALIDATION_ERROR", message: "Missing Bearer API key" },
    });
    return null;
  }

  const rows = await db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.keyHash, hashKey(token)))
    .limit(1);

  const row = rows[0];
  if (!row || row.revokedAt) {
    reply.code(401).send({
      failure: { code: "VALIDATION_ERROR", message: "Invalid API key" },
    });
    return null;
  }

  return {
    tenantId: row.tenantId,
    apiKeyId: row.id,
    keyName: row.name,
    scopes: row.scopes ?? [],
  };
}
