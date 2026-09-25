import test from "node:test";
import assert from "node:assert/strict";
import { decryptVault, encryptVault } from "./vault-crypto.js";

test("vault ciphertext round-trips and is not plaintext", () => {
  process.env.VAULT_DATA_KEY = Buffer.alloc(32, 7).toString("base64");
  const plain = JSON.stringify({ cookies: [{ name: "sid", value: "abc" }] });
  const sealed = encryptVault(plain);
  assert.equal(sealed.includes("abc"), false);
  assert.equal(decryptVault(sealed), plain);
});
