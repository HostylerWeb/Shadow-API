import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function dataKey(): Buffer {
  const raw = process.env.VAULT_DATA_KEY;
  if (!raw) throw new Error("VAULT_DATA_KEY is required");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("VAULT_DATA_KEY must be 32 bytes, base64-encoded");
  return key;
}

/** AES-256-GCM ciphertext: base64(iv).base64(tag).base64(ciphertext). Local stand-in for KMS. */
export function encryptVault(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", dataKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${ciphertext.toString("base64")}`;
}

export function decryptVault(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split(".");
  if (!ivB64 || !tagB64 || !dataB64) throw new Error("Invalid vault ciphertext");
  const decipher = createDecipheriv("aes-256-gcm", dataKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
}
