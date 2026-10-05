import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  getAndroidAppRedirectUri,
  getAndroidCallbackOrigin,
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
  delete process.env.ANDROID_CALLBACK_ORIGIN;
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

  it("requires https for allowlisted hosts (no custom scheme or plain http)", () => {
    // hostname is claude.ai, but the code would go to the app claiming com.evil.
    expect(isAllowedClientRedirect("com.evil://claude.ai/api/mcp/auth_callback")).toBe(false);
    expect(isAllowedClientRedirect("http://claude.ai/api/mcp/auth_callback")).toBe(false);
    process.env.MCP_ALLOW_LOOPBACK_REDIRECT = "true";
    expect(isAllowedClientRedirect("evil://localhost/cb")).toBe(false);
    expect(isAllowedClientRedirect("http://[::1]:8080/callback")).toBe(true);
  });

  it("rejects empty or unparseable redirect URIs", () => {
    expect(isAllowedClientRedirect(undefined)).toBe(false);
    expect(isAllowedClientRedirect("not a url")).toBe(false);
  });
});

describe("Android app redirect (first-party App Link)", () => {
  it("derives the planner origin from NEXT_PUBLIC_SITE_URL, else planr.page", () => {
    expect(getPlannerOrigin()).toBe("https://planr.page");

    process.env.NEXT_PUBLIC_SITE_URL = "https://staging.planr.page/";
    expect(getPlannerOrigin()).toBe("https://staging.planr.page");

    process.env.NEXT_PUBLIC_SITE_URL = "not a url";
    expect(getPlannerOrigin()).toBe("https://planr.page");
  });

  it("puts the callback on its own host (auth.planr.page by default)", () => {
    // A different host from the consent page, so Chrome hands it to the App Link.
    expect(getAndroidCallbackOrigin()).toBe("https://auth.planr.page");
    expect(getAndroidAppRedirectUri()).toBe("https://auth.planr.page/app/auth/callback");

    process.env.ANDROID_CALLBACK_ORIGIN = "https://auth.staging.planr.page/";
    expect(getAndroidAppRedirectUri()).toBe(
      "https://auth.staging.planr.page/app/auth/callback",
    );

    process.env.ANDROID_CALLBACK_ORIGIN = "not a url";
    expect(getAndroidCallbackOrigin()).toBe("https://auth.planr.page");
  });

  it("allows the exact callback by default", () => {
    expect(isAllowedClientRedirect("https://auth.planr.page/app/auth/callback")).toBe(true);
    expect(isAndroidAppRedirect("https://AUTH.planr.page:443/app/auth/callback")).toBe(true);
  });

  it("still allows the callback on the planner origin (builds before auth.planr.page)", () => {
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
    expect(isAllowedClientRedirect("https://auth.planr.page/app/auth/callback")).toBe(true);
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
      "https://auth.planr.page/",
      "https://auth.planr.page/app/auth/callback/extra",
      "https://auth.planr.page/app/auth/callback?next=https://evil.example.com",
      "http://auth.planr.page/app/auth/callback",
      "https://evil.auth.planr.page/app/auth/callback",
      "page.planr.android://app/auth/callback",
      "page.planr.android:/oauth/callback",
    ]) {
      expect(isAllowedClientRedirect(uri), uri).toBe(false);
    }
  });
});
