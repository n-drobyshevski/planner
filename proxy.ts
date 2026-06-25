import createMiddleware from "next-intl/middleware";
import { type NextRequest } from "next/server";
import { routing } from "@/i18n/routing";
import { updateSession } from "@/lib/supabase/middleware";

// Next.js 16 "proxy" convention (replaces the deprecated middleware file).
// Two concerns, chained: next-intl resolves the locale (cookie → Accept-Language
// → default) and rewrites onto the `[locale]` segment; Supabase then refreshes
// the session and gates auth on top of that response.
const handleI18n = createMiddleware(routing);

// Public, statically renderable auth routes. We still run next-intl here (the
// unprefixed en `/login` and `/oauth/consent` rewrite onto the `[locale]` segment
// via next-intl, so they can't leave the matcher) but SKIP the Supabase session
// work: its only effect on these paths is bouncing an already-authenticated user
// (now handled client-side in login-screen) or re-checking auth that the consent
// page already does itself — not worth a Node cold start in front of the CDN shell.
// `/ru/login` is fully prefixed + static, so it's excluded from the matcher entirely
// below and served from the edge with no function at all.
function isPublicAuthRoute(path: string): boolean {
  return (
    path === "/login" ||
    path === "/ru/login" ||
    path === "/oauth/consent" ||
    path === "/ru/oauth/consent"
  );
}

export async function proxy(request: NextRequest) {
  const i18nResponse = handleI18n(request);
  // When next-intl is itself redirecting (locale negotiation or adding the `/ru`
  // prefix), let that win — the destination re-runs the proxy and auth-gates
  // there, with the locale now settled.
  if (i18nResponse.headers.has("location")) return i18nResponse;
  // Public auth routes: skip Supabase gating, keep the (cheap) i18n pass.
  if (isPublicAuthRoute(request.nextUrl.pathname)) return i18nResponse;
  // Otherwise (a rewrite/pass-through), run auth gating and merge the refreshed
  // session cookies into the i18n response.
  return updateSession(request, i18nResponse);
}

export const config = {
  matcher: [
    // Everything except API routes, Next internals, files with an extension, the
    // public `/share/<token>` surface (anonymous, read-only — intentionally OUTSIDE
    // auth and locale routing), and `/ru/login` — a fully prefixed, fully static
    // (`use cache`/`cacheLife max`) page that maps straight to the prerendered
    // `[locale]=ru` shell, so excluding it lets Vercel serve it from the edge with
    // no proxy function. The unprefixed `/login` CANNOT be excluded — its URL only
    // resolves via the next-intl rewrite — so it stays matched but Supabase-skipped
    // (see `proxy` above).
    "/((?!api|_next|_vercel|share|ru/login|.*\\..*).*)",
  ],
};
