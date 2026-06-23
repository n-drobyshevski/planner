import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { isAllowedClientRedirect } from "@/lib/mcp/env";

const ENV = { ...process.env };
afterEach(() => {
  process.env = { ...ENV };
});
beforeEach(() => {
  delete process.env.MCP_ALLOWED_REDIRECT_HOSTS;
  delete process.env.MCP_ALLOW_LOOPBACK_REDIRECT;
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
