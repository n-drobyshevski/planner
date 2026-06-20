import "server-only";

import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);

const KEY_LEN = 32; // derived key bytes
const SALT_LEN = 16; // random salt bytes

/**
 * Hash a login secret (passphrase / PIN) with a salted scrypt KDF. Replaces the
 * old unsalted SHA-256: scrypt is deliberately slow and memory-hard, so even a
 * leaked digest can't be brute-forced offline at SHA-256 speed. Returns the salt
 * and digest as hex for storage in members.secret_salt / members.secret_hash.
 */
export async function hashSecret(
  secret: string,
): Promise<{ salt: string; hash: string }> {
  const salt = randomBytes(SALT_LEN);
  const derived = (await scryptAsync(secret, salt, KEY_LEN)) as Buffer;
  return { salt: salt.toString("hex"), hash: derived.toString("hex") };
}

/**
 * Verify a candidate secret against a stored salt+hash. Constant-time compare so
 * a mismatch leaks no timing signal. Returns false (never throws) when the stored
 * values are missing or malformed.
 */
export async function verifySecret(
  secret: string,
  salt: string | null,
  hash: string | null,
): Promise<boolean> {
  if (!salt || !hash) return false;
  let saltBuf: Buffer;
  let hashBuf: Buffer;
  try {
    saltBuf = Buffer.from(salt, "hex");
    hashBuf = Buffer.from(hash, "hex");
  } catch {
    return false;
  }
  if (hashBuf.length !== KEY_LEN) return false;
  const derived = (await scryptAsync(secret, saltBuf, KEY_LEN)) as Buffer;
  return timingSafeEqual(derived, hashBuf);
}
