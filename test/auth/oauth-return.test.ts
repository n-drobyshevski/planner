import { describe, it, expect } from "vitest";
import { safeAuthorizationId, postLoginPath } from "@/lib/auth/oauth-return";

describe("safeAuthorizationId", () => {
  it("accepts well-formed opaque tokens", () => {
    expect(safeAuthorizationId("dlladgt6ntwg5wx6gdo6mwdqbeipf2xf")).toBe(
      "dlladgt6ntwg5wx6gdo6mwdqbeipf2xf",
    );
    expect(safeAuthorizationId("ABC123_-.~")).toBe("ABC123_-.~");
  });

  it("rejects empty, short, or malformed values", () => {
    expect(safeAuthorizationId(null)).toBeNull();
    expect(safeAuthorizationId(undefined)).toBeNull();
    expect(safeAuthorizationId("")).toBeNull();
    expect(safeAuthorizationId("short")).toBeNull();
  });

  it("rejects injection / open-redirect attempts", () => {
    expect(safeAuthorizationId("https://evil.com/steal")).toBeNull();
    expect(safeAuthorizationId("//evil.com")).toBeNull();
    expect(safeAuthorizationId("abc/../../etc/passwd")).toBeNull();
    expect(safeAuthorizationId("abc?x=1&y=2")).toBeNull();
    expect(safeAuthorizationId("a".repeat(200))).toBeNull();
  });
});

describe("postLoginPath", () => {
  it("returns the locale calendar when there is no authorization id", () => {
    expect(postLoginPath("en", null)).toBe("/en/calendar");
    expect(postLoginPath("ru", undefined)).toBe("/ru/calendar");
  });

  it("returns the locale consent path with the id when resuming OAuth", () => {
    expect(postLoginPath("en", "dlladgt6ntwg5wx6gdo6mwdqbeipf2xf")).toBe(
      "/en/oauth/consent?authorization_id=dlladgt6ntwg5wx6gdo6mwdqbeipf2xf",
    );
  });

  it("never routes to consent for an invalid id (falls back to calendar)", () => {
    expect(postLoginPath("en", "https://evil.com")).toBe("/en/calendar");
  });
});
