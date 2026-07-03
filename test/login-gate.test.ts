import { describe, expect, it } from "vitest";
import { passkeyOnly } from "@/lib/auth/passkey-gate";

describe("passkeyOnly — typed-name sign-in gate", () => {
  it("refuses the typed-name path for a member whose only factor is a passkey", () => {
    expect(passkeyOnly({ has_passkey: true, has_secret: false })).toBe(true);
  });

  it("lets a passphrase member through (checkSecret enforces the passphrase)", () => {
    expect(passkeyOnly({ has_passkey: false, has_secret: true })).toBe(false);
  });

  it("lets a member with both factors choose the passphrase path", () => {
    expect(passkeyOnly({ has_passkey: true, has_secret: true })).toBe(false);
  });

  it("keeps the neither-factor bootstrap path open (fresh workspace)", () => {
    expect(passkeyOnly({ has_passkey: false, has_secret: false })).toBe(false);
  });
});
