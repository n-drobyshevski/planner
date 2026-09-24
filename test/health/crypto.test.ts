import { describe, it, expect, beforeEach } from "vitest";
import {
  encryptToken,
  decryptToken,
  bufferToPgBytea,
  pgByteaToBuffer,
} from "@/lib/health/crypto";

describe("health/crypto", () => {
  beforeEach(() => {
    process.env.HEALTH_TOKEN_KEY = Buffer.alloc(32, 7).toString("base64");
  });

  it("round-trips a plaintext token", () => {
    const plaintext = "1//0gABCDEFGHIJKLMNOPQRSTUVWXYZ-refresh-token";
    const blob = encryptToken(plaintext);
    expect(decryptToken(blob)).toBe(plaintext);
  });

  it("produces a different ciphertext each time (random IV)", () => {
    const a = encryptToken("same-plaintext");
    const b = encryptToken("same-plaintext");
    expect(a.equals(b)).toBe(false);
  });

  it("fails to decrypt with a different key (auth tag mismatch)", () => {
    const blob = encryptToken("secret");
    process.env.HEALTH_TOKEN_KEY = Buffer.alloc(32, 9).toString("base64");
    expect(() => decryptToken(blob)).toThrow();
  });

  it("rejects a malformed (too-short) blob", () => {
    expect(() => decryptToken(Buffer.from("short"))).toThrow(/too short/);
  });

  it("throws a legible error when HEALTH_TOKEN_KEY is unset", () => {
    delete process.env.HEALTH_TOKEN_KEY;
    expect(() => encryptToken("x")).toThrow(/HEALTH_TOKEN_KEY/);
  });

  it("round-trips the Postgres bytea hex encoding", () => {
    const blob = encryptToken("round-trip-me");
    const pg = bufferToPgBytea(blob);
    expect(pg.startsWith("\\x")).toBe(true);
    expect(pgByteaToBuffer(pg).equals(blob)).toBe(true);
    expect(decryptToken(pgByteaToBuffer(pg))).toBe("round-trip-me");
  });
});
