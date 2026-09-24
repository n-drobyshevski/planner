import "server-only";
import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";

/**
 * AES-256-GCM for the one secret this app stores at rest: the Google Health
 * OAuth refresh token (`health_connections.refresh_token_enc`). Server-only —
 * this is the ONLY module that touches that column's plaintext.
 *
 * Wire format: iv (12 bytes) || authTag (16 bytes) || ciphertext, as a single
 * Buffer. `HEALTH_TOKEN_KEY` is a base64-encoded 256-bit key
 * (e.g. `openssl rand -base64 32`).
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96-bit nonce, the GCM-recommended size
const TAG_LENGTH = 16;
const KEY_LENGTH = 32; // 256 bits

function getKey(): Buffer {
  const b64 = process.env.HEALTH_TOKEN_KEY;
  if (!b64) {
    throw new Error(
      "HEALTH_TOKEN_KEY is not set. Generate one with `openssl rand -base64 32` " +
        "and set it in .env.local / the Vercel project settings.",
    );
  }
  let key: Buffer;
  try {
    key = Buffer.from(b64, "base64");
  } catch {
    throw new Error("HEALTH_TOKEN_KEY is not valid base64.");
  }
  if (key.length !== KEY_LENGTH) {
    throw new Error(
      `HEALTH_TOKEN_KEY must decode to ${KEY_LENGTH} bytes (a base64-encoded ` +
        `256-bit key); got ${key.length}.`,
    );
  }
  return key;
}

/** Encrypt a plaintext token. Returns the iv||tag||ciphertext Buffer. */
export function encryptToken(plaintext: string): Buffer {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]);
}

/** Decrypt a Buffer produced by `encryptToken`. Throws if the tag doesn't verify. */
export function decryptToken(blob: Buffer): string {
  if (blob.length < IV_LENGTH + TAG_LENGTH) {
    throw new Error("Malformed encrypted token (too short).");
  }
  const iv = blob.subarray(0, IV_LENGTH);
  const tag = blob.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ciphertext = blob.subarray(IV_LENGTH + TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

/**
 * PostgREST represents `bytea` columns as a hex-escaped string (`"\\x..."`)
 * on both read and write. These two helpers are the only place that format is
 * spelled out, so `lib/health/sync.ts` never hand-rolls it.
 */
export function bufferToPgBytea(buf: Buffer): string {
  return `\\x${buf.toString("hex")}`;
}

export function pgByteaToBuffer(value: string): Buffer {
  const hex = value.startsWith("\\x") ? value.slice(2) : value;
  return Buffer.from(hex, "hex");
}
