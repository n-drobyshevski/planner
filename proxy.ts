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
// via next-intl, so they CANNOT leave the matcher — their URL only resolves via that
// rewrite) but SKIP the Supabase session work: its only effect on these paths is
// bouncing an already-authenticated user (now handled client-side in login-screen)
// or re-checking auth that the consent page already does itself — not worth a Node
// cold start in front of the CDN shell.
// The fully PREFIXED variants — `/ru/login`, `/ru/oauth/consent` — map straight to
// the `[locale]=ru` segment with no rewrite needed, so they're excluded from the
// matcher entirely below and served from the edge with no function at all.
function isPublicAuthRoute(path: string): boolean {
  return path === "/login" || path === "/oauth/consent";
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
    // auth and locale routing), and the fully prefixed `/ru/login` + `/ru/oauth/consent`
    // — pages that map straight to the prerendered `[locale]=ru` shell (its dynamic
    // parts stream behind Suspense), so excluding them lets Vercel serve the shell
    // from the edge with no proxy function. The unprefixed `/login` and
    // `/oauth/consent` CANNOT be excluded — their URLs only resolve via the next-intl
    // rewrite — so they stay matched but Supabase-skipped (see `proxy` above). The
    // consent pages self-guard auth and bounce to /login themselves when signed out.
    "/((?!api|_next|_vercel|share|ru/login|ru/oauth/consent|.*\\..*).*)",
  ],
};
