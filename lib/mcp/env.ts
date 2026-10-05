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

/**
 * Allowed OAuth-client redirect hosts — the "Claude only" guard. Supabase's
 * dynamic client registration lets ANY client register, so we gate which clients
 * can actually be authorized by their redirect host at our consent/decision layer.
 *
 * Default: `claude.ai` (covers claude.ai web, Desktop, mobile, and Cowork, which
 * all redirect to https://claude.ai/api/mcp/auth_callback). Override with
 * MCP_ALLOWED_REDIRECT_HOSTS (comma-separated); set to `*` to allow any client.
 * The Android app's own callback is allowed separately (see isAndroidAppRedirect).
 */
export function getAllowedRedirectHosts(): string[] {
  const raw = process.env.MCP_ALLOWED_REDIRECT_HOSTS;
  if (raw && raw.trim()) {
    return raw
      .split(",")
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean);
  }
  return ["claude.ai"];
}

/** Path of the Android app's OAuth callback (an App Link on the planner's own origin). */
export const ANDROID_APP_CALLBACK_PATH = "/app/auth/callback";

/**
 * The Android app's private-use-scheme callback (RFC 8252 §7.1). This is what
 * the app signs in with: Chrome keeps a same-host navigation (consent →
 * planr.page/app/auth/callback) inside the Custom Tab instead of handing it to
 * the App Link, but always hands a custom scheme to the app.
 */
export const ANDROID_APP_SCHEME_REDIRECT_URI = "page.planr.android:/oauth/callback";

/** The "Planr for Android" OAuth client registered on the production project. */
const DEFAULT_ANDROID_OAUTH_CLIENT_ID = "c90ca50b-da07-4a54-b3eb-b58a0936748d";

/**
 * Client id of the first-party Android app (ANDROID_OAUTH_CLIENT_ID, else the
 * production client). Client ids are public; this pins the custom-scheme
 * callback to the one client we registered.
 */
export function getAndroidOAuthClientId(): string {
  return process.env.ANDROID_OAUTH_CLIENT_ID?.trim() || DEFAULT_ANDROID_OAUTH_CLIENT_ID;
}

/** Production origin, used when NEXT_PUBLIC_SITE_URL is unset (local dev, previews). */
const DEFAULT_PLANNER_ORIGIN = "https://planr.page";

/**
 * The planner's own canonical origin (scheme + host + port). Derived from
 * NEXT_PUBLIC_SITE_URL when set and parseable, else https://planr.page — the
 * origin the Android app is built against (PLANR_WEB_ORIGIN) and the one its
 * App Link is verified for via /.well-known/assetlinks.json.
 */
export function getPlannerOrigin(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL;
  if (raw && raw.trim()) {
    try {
      return new URL(raw.trim()).origin;
    } catch {
      /* malformed — fall back to the production origin */
    }
  }
  return DEFAULT_PLANNER_ORIGIN;
}

/** The exact redirect URI the "Planr for Android" OAuth client registers. */
export function getAndroidAppRedirectUri(): string {
  return `${getPlannerOrigin()}${ANDROID_APP_CALLBACK_PATH}`;
}

/**
 * True iff `redirectUri` is one of the Android app's callbacks:
 *
 * - the App Link on the planner's own origin, matched on the full origin + path
 *   (no query, fragment, or userinfo) rather than by host, so allowing it never
 *   opens the rest of the planner's host as a redirect target. A code sent there
 *   is safe even for a rogue client registered with this URI: the verified App
 *   Link only reaches the Planr app (whose PKCE verifier won't match), and the
 *   web fallback page never reads it.
 * - the custom-scheme callback, but only for the registered Android client
 *   ([clientId] must equal getAndroidOAuthClientId()). Any app can claim a
 *   custom scheme and dynamic registration lets any client name it, so without
 *   the client pin a look-alike client would be shown as "Planr for Android"
 *   and its own app would receive the code.
 */
export function isAndroidAppRedirect(
  redirectUri: string | undefined,
  clientId?: string,
): boolean {
  if (!redirectUri) return false;
  if (redirectUri === ANDROID_APP_SCHEME_REDIRECT_URI) {
    return clientId !== undefined && clientId === getAndroidOAuthClientId();
  }
  let url: URL;
  try {
    url = new URL(redirectUri);
  } catch {
    return false;
  }
  return (
    url.origin === getPlannerOrigin() &&
    url.pathname === ANDROID_APP_CALLBACK_PATH &&
    !url.search &&
    !url.hash &&
    !url.username &&
    !url.password
  );
}

/**
 * Whether to also allow RFC 8252 loopback redirects (http://localhost / 127.0.0.1
 * on an ephemeral port). Claude Code uses these — but so does any native MCP
 * client, so it's off by default. Enable with MCP_ALLOW_LOOPBACK_REDIRECT=true.
 */
export function mcpAllowLoopbackRedirect(): boolean {
  return process.env.MCP_ALLOW_LOOPBACK_REDIRECT === "true";
}

/**
 * True iff a client's redirect URI is permitted to be authorized. Authoritative
 * check lives in /api/oauth/decision; the consent page mirrors it for UX.
 *
 * The Android app's first-party callbacks are always allowed (independent of the
 * host override below; the custom scheme only with the app's client id);
 * everything else goes through the Claude-only host guard.
 */
export function isAllowedClientRedirect(
  redirectUri: string | undefined,
  clientId?: string,
): boolean {
  if (!redirectUri) return false;
  if (isAndroidAppRedirect(redirectUri, clientId)) return true;
  let host: string;
  try {
    host = new URL(redirectUri).hostname.toLowerCase();
  } catch {
    return false;
  }
  const allowed = getAllowedRedirectHosts();
  if (allowed.includes("*")) return true;
  if (
    mcpAllowLoopbackRedirect() &&
    (host === "localhost" || host === "127.0.0.1" || host === "::1")
  ) {
    return true;
  }
  return allowed.some((h) => host === h || host.endsWith(`.${h}`));
}
