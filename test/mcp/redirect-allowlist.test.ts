import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  ANDROID_APP_SCHEME_REDIRECT_URI,
  getAndroidAppRedirectUri,
  getAndroidOAuthClientId,
  getPlannerOrigin,
  isAllowedClientRedirect,
  isAndroidAppRedirect,
} from "@/lib/mcp/env";

const ENV = { ...process.env };
afterEach(() => {
  process.env = { ...ENV };
});
beforeEach(() => {
  delete process.env.MCP_ALLOWED_REDIRECT_HOSTS;
  delete process.env.MCP_ALLOW_LOOPBACK_REDIRECT;
  delete process.env.NEXT_PUBLIC_SITE_URL;
  delete process.env.ANDROID_OAUTH_CLIENT_ID;
});

describe("isAllowedClientRedirect (Claude-only guard)", () => {
  it("allows claude.ai by default (web/desktop/mobile callback)", () => {
    expect(isAllowedClientRedirect("https://claude.ai/api/mcp/auth_callback")).toBe(true);
  });

  it("allows subdomains of an allowed host", () => {
    expect(isAllowedClientRedirect("https://foo.claude.ai/cb")).toBe(true);
  });

  it("rejects unrelated hosts", () => {
    expect(isAllowedClientRedirect("https://evil.example.com/cb")).toBe(false);
    expect(isAllowedClientRedirect("https://notclaude.ai.evil.com/cb")).toBe(false);
  });

  it("rejects loopback by default, allows it when opted in", () => {
    expect(isAllowedClientRedirect("http://localhost:51731/callback")).toBe(false);
    process.env.MCP_ALLOW_LOOPBACK_REDIRECT = "true";
    expect(isAllowedClientRedirect("http://localhost:51731/callback")).toBe(true);
    expect(isAllowedClientRedirect("http://127.0.0.1:8080/callback")).toBe(true);
  });

  it("honors a custom host list and the wildcard", () => {
    process.env.MCP_ALLOWED_REDIRECT_HOSTS = "claude.com, example.org";
    expect(isAllowedClientRedirect("https://claude.com/cb")).toBe(true);
    expect(isAllowedClientRedirect("https://example.org/cb")).toBe(true);
    expect(isAllowedClientRedirect("https://claude.ai/cb")).toBe(false); // no longer default

    process.env.MCP_ALLOWED_REDIRECT_HOSTS = "*";
    expect(isAllowedClientRedirect("https://anything.example.com/cb")).toBe(true);
  });

  it("rejects empty or unparseable redirect URIs", () => {
    expect(isAllowedClientRedirect(undefined)).toBe(false);
    expect(isAllowedClientRedirect("not a url")).toBe(false);
  });
});

describe("Android app redirect (first-party App Link)", () => {
  it("derives the planner origin from NEXT_PUBLIC_SITE_URL, else planr.page", () => {
    expect(getPlannerOrigin()).toBe("https://planr.page");
    expect(getAndroidAppRedirectUri()).toBe("https://planr.page/app/auth/callback");

    process.env.NEXT_PUBLIC_SITE_URL = "https://staging.planr.page/";
    expect(getPlannerOrigin()).toBe("https://staging.planr.page");
    expect(getAndroidAppRedirectUri()).toBe(
      "https://staging.planr.page/app/auth/callback",
    );

    process.env.NEXT_PUBLIC_SITE_URL = "not a url";
    expect(getPlannerOrigin()).toBe("https://planr.page");
  });

  it("allows the exact callback by default", () => {
    expect(isAllowedClientRedirect("https://planr.page/app/auth/callback")).toBe(true);
    expect(isAndroidAppRedirect("https://PLANR.page:443/app/auth/callback")).toBe(true);
  });

  it("follows the configured site origin", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://staging.planr.page";
    expect(isAllowedClientRedirect("https://staging.planr.page/app/auth/callback")).toBe(
      true,
    );
    expect(isAllowedClientRedirect("https://planr.page/app/auth/callback")).toBe(false);
  });

  it("stays allowed when the Claude host list is overridden", () => {
    process.env.MCP_ALLOWED_REDIRECT_HOSTS = "claude.com";
    expect(isAllowedClientRedirect("https://planr.page/app/auth/callback")).toBe(true);
  });

  it("does not open the rest of the planner host", () => {
    for (const uri of [
      "https://planr.page/",
      "https://planr.page/calendar",
      "https://planr.page/app/auth/callback/",
      "https://planr.page/app/auth/callback/extra",
      "https://planr.page/app/auth/callback?next=https://evil.example.com",
      "https://planr.page/app/auth/callback#frag",
      "https://user:pass@planr.page/app/auth/callback",
      "http://planr.page/app/auth/callback",
      "https://planr.page:8443/app/auth/callback",
      "https://evil.planr.page/app/auth/callback",
      "https://planr.page.evil.com/app/auth/callback",
      "page.planr.android://app/auth/callback",
    ]) {
      expect(isAllowedClientRedirect(uri), uri).toBe(false);
    }
  });
});

describe("Android app redirect (custom scheme, pinned to the app's client)", () => {
  const appClient = "c90ca50b-da07-4a54-b3eb-b58a0936748d";

  it("allows the scheme callback only for the registered Android client", () => {
    expect(ANDROID_APP_SCHEME_REDIRECT_URI).toBe("page.planr.android:/oauth/callback");
    expect(getAndroidOAuthClientId()).toBe(appClient);
    expect(isAndroidAppRedirect(ANDROID_APP_SCHEME_REDIRECT_URI, appClient)).toBe(true);
    expect(isAllowedClientRedirect(ANDROID_APP_SCHEME_REDIRECT_URI, appClient)).toBe(true);
  });

  it("refuses a look-alike client using the same scheme callback", () => {
    // Dynamic registration lets any client name this URI, and any app can claim
    // the scheme — without the client pin it would be shown as Planr for Android.
    expect(isAndroidAppRedirect(ANDROID_APP_SCHEME_REDIRECT_URI, "rogue-client")).toBe(false);
    expect(isAllowedClientRedirect(ANDROID_APP_SCHEME_REDIRECT_URI, "rogue-client")).toBe(
      false,
    );
    expect(isAllowedClientRedirect(ANDROID_APP_SCHEME_REDIRECT_URI)).toBe(false);
  });

  it("follows ANDROID_OAUTH_CLIENT_ID", () => {
    process.env.ANDROID_OAUTH_CLIENT_ID = "staging-client";
    expect(isAllowedClientRedirect(ANDROID_APP_SCHEME_REDIRECT_URI, "staging-client")).toBe(
      true,
    );
    expect(isAllowedClientRedirect(ANDROID_APP_SCHEME_REDIRECT_URI, appClient)).toBe(false);
  });

  it("stays allowed when the Claude host list is overridden", () => {
    process.env.MCP_ALLOWED_REDIRECT_HOSTS = "claude.com";
    expect(isAllowedClientRedirect(ANDROID_APP_SCHEME_REDIRECT_URI, appClient)).toBe(true);
  });

  it("matches the exact URI only", () => {
    for (const uri of [
      "page.planr.android:/oauth/callback/",
      "page.planr.android:/oauth/callback?x=1",
      "page.planr.android:/oauth/callback#frag",
      "page.planr.android:/oauth/other",
      "page.planr.android://oauth/callback",
      "PAGE.PLANR.ANDROID:/oauth/callback",
      "page.planr.evil:/oauth/callback",
    ]) {
      expect(isAllowedClientRedirect(uri, appClient), uri).toBe(false);
    }
  });

  it("keeps the App Link form working for any client (older builds)", () => {
    expect(isAllowedClientRedirect("https://planr.page/app/auth/callback", "other")).toBe(
      true,
    );
  });
});
