import createMiddleware from "next-intl/middleware";
import { type NextRequest } from "next/server";
import { routing } from "@/i18n/routing";
import { updateSession } from "@/lib/supabase/middleware";

// Next.js 16 "proxy" convention (replaces the deprecated middleware file).
// Two concerns, chained: next-intl resolves the locale (cookie → Accept-Language
// → default) and rewrites onto the `[locale]` segment; Supabase then refreshes
// the session and gates auth on top of that response.
const handleI18n = createMiddleware(routing);

export async function proxy(request: NextRequest) {
  const i18nResponse = handleI18n(request);
  // When next-intl is itself redirecting (locale negotiation or adding the `/ru`
  // prefix), let that win — the destination re-runs the proxy and auth-gates
  // there, with the locale now settled. Otherwise (a rewrite/pass-through), run
  // auth gating and merge the refreshed session cookies into the i18n response.
  if (i18nResponse.headers.has("location")) return i18nResponse;
  return updateSession(request, i18nResponse);
}

export const config = {
  matcher: [
    // Everything except API routes, Next internals, files with an extension, and
    // the public `/share/<token>` surface — which is intentionally OUTSIDE auth and
    // locale routing (an anonymous, read-only calendar). Keeping it off the matcher
    // means next-intl never prefixes it and Supabase never gates it.
    "/((?!api|_next|_vercel|share|.*\\..*).*)",
  ],
};
