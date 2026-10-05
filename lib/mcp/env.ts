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

/** Path of the Android app's OAuth callback (an App Link). */
export const ANDROID_APP_CALLBACK_PATH = "/app/auth/callback";

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

/** Default host of the Android App Link callback; see getAndroidCallbackOrigin. */
const DEFAULT_ANDROID_CALLBACK_ORIGIN = "https://auth.planr.page";

/**
 * Origin of the Android app's OAuth callback (ANDROID_CALLBACK_ORIGIN, else
 * https://auth.planr.page). Deliberately a different host from the planner:
 * Chrome keeps a same-host navigation (consent on planr.page → callback on
 * planr.page) inside the Custom Tab instead of handing it to the App Link, but
 * hands a cross-host one to the app. The same deployment serves both hosts, so
 * /.well-known/assetlinks.json is served here too.
 */
export function getAndroidCallbackOrigin(): string {
  const raw = process.env.ANDROID_CALLBACK_ORIGIN;
  if (raw && raw.trim()) {
    try {
      return new URL(raw.trim()).origin;
    } catch {
      /* malformed — fall back to the production callback origin */
    }
  }
  return DEFAULT_ANDROID_CALLBACK_ORIGIN;
}

/** The exact redirect URI the "Planr for Android" OAuth client registers. */
export function getAndroidAppRedirectUri(): string {
  return `${getAndroidCallbackOrigin()}${ANDROID_APP_CALLBACK_PATH}`;
}

/**
 * True iff `redirectUri` is exactly the Android app's App Link callback, on the
 * callback origin (getAndroidCallbackOrigin) or, for builds made before it, the
 * planner's own origin. Matched on the full origin + path (no query, fragment, or
 * userinfo) rather than by host, so allowing it never opens the rest of either
 * host as a redirect target. A code sent there is safe even for a
 * rogue client registered with this URI: the verified App Link delivers it to
 * the Planr app (whose PKCE verifier won't match), and the web fallback page
 * never reads it.
 */
export function isAndroidAppRedirect(redirectUri: string | undefined): boolean {
  if (!redirectUri) return false;
  let url: URL;
  try {
    url = new URL(redirectUri);
  } catch {
    return false;
  }
  return (
    (url.origin === getAndroidCallbackOrigin() || url.origin === getPlannerOrigin()) &&
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
 * The Android app's first-party callback is always allowed (independent of the
 * host override below); everything else goes through the Claude-only host guard.
 */
export function isAllowedClientRedirect(redirectUri: string | undefined): boolean {
  if (!redirectUri) return false;
  if (isAndroidAppRedirect(redirectUri)) return true;
  let url: URL;
  try {
    url = new URL(redirectUri);
  } catch {
    return false;
  }
  const host = url.hostname.toLowerCase();
  const allowed = getAllowedRedirectHosts();
  if (allowed.includes("*")) return true;
  // The host alone isn't enough: `com.evil://claude.ai/cb` has hostname
  // claude.ai but is delivered to whichever app claims `com.evil`. Allowlisted
  // hosts must be https; plain http only for opted-in loopback.
  if (
    mcpAllowLoopbackRedirect() &&
    (url.protocol === "http:" || url.protocol === "https:") &&
    (host === "localhost" || host === "127.0.0.1" || host === "[::1]")
  ) {
    return true;
  }
  if (url.protocol !== "https:") return false;
  return allowed.some((h) => host === h || host.endsWith(`.${h}`));
}
