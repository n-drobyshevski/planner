import { describe, it, expect, vi } from "vitest";

// Only the static `config` is under test; stub the runtime middlewares (next-intl's
// ESM build can't resolve `next/server` under vitest).
vi.mock("next-intl/middleware", () => ({ default: () => () => new Response() }));
vi.mock("@/lib/supabase/middleware", () => ({ updateSession: vi.fn() }));

import { config } from "@/proxy";

// The matcher is a single path-to-regexp pattern whose body is plain regex, so
// anchoring it reproduces which paths reach the proxy (locale + auth gating).
const matcher = new RegExp(`^${config.matcher[0]}$`);

describe("proxy matcher", () => {
  it("still gates app surfaces", () => {
    expect(matcher.test("/calendar")).toBe(true);
    expect(matcher.test("/ru/tasks")).toBe(true);
    expect(matcher.test("/oauth/consent")).toBe(true);
  });

  it("leaves the Android App Link surfaces alone", () => {
    // OAuth callback fallback: served verbatim, never locale-rewritten or
    // bounced to /login with its one-time code.
    expect(matcher.test("/app/auth/callback")).toBe(false);
    // Digital Asset Links: fetched anonymously by Android's verifier.
    expect(matcher.test("/.well-known/assetlinks.json")).toBe(false);
  });
});
