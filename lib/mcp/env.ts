import "server-only";

/**
 * Config for the MCP server surface. Kept separate from `lib/supabase/env.ts`
 * so the Supabase clients stay free of MCP concerns. All vars are server-only.
 */

/** True when the MCP endpoint should be mounted (off unless explicitly enabled). */
export function isMcpEnabled(): boolean {
  return process.env.MCP_ENABLED === "true";
}

/**
 * Redis connection string for mcp-handler's streamable-HTTP session state.
 * mcp-handler reads `REDIS_URL || KV_URL` itself; we surface a legible error
 * when neither is set while the feature is on, instead of its opaque throw.
 */
export function getMcpRedisUrl(): string {
  const url = process.env.REDIS_URL || process.env.KV_URL;
  if (!url) {
    throw new Error(
      "MCP is enabled but no Redis URL is set. mcp-handler needs REDIS_URL " +
        "(or KV_URL) for streamable-HTTP session state. On Vercel, add the " +
        "Upstash/Redis Marketplace integration (region fra1); locally set " +
        "REDIS_URL=redis://localhost:6379 in .env.local.",
    );
  }
  return url;
}

/**
 * Optional explicit resource URL override for the OAuth Protected Resource
 * metadata and the `WWW-Authenticate` challenge. Left undefined by default so
 * mcp-handler derives it from the request (X-Forwarded-* on Vercel) — which
 * keeps the resource identifier and the advertised metadata consistent. Set
 * MCP_RESOURCE_URL only behind a proxy that strips forwarding headers.
 */
export function getMcpResourceUrl(): string | undefined {
  return process.env.MCP_RESOURCE_URL || undefined;
}

/**
 * Issuer URL of the Supabase OAuth 2.1 authorization server — the value MCP
 * clients use to discover the auth server (RFC 8414). For Supabase this is the
 * project's `/auth/v1` endpoint.
 */
export function getSupabaseAuthIssuer(): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL is required to advertise the OAuth authorization server.",
    );
  }
  return `${base.replace(/\/$/, "")}/auth/v1`;
}
