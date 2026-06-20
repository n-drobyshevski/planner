import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseConfig, isSupabaseConfigured } from "./env";

/** Active locale from the pathname (only `ru` carries a prefix; `as-needed`). */
function localeOf(path: string): "en" | "ru" {
  return path === "/ru" || path.startsWith("/ru/") ? "ru" : "en";
}

/**
 * Refresh the Supabase session cookie on each request and gate routes:
 * unauthenticated -> /login; authenticated on "/" or /login -> /calendar — all
 * locale-aware (Russian keeps its `/ru` prefix).
 *
 * Auth presence is read with `getClaims()`, NOT `getUser()`. With the project's
 * asymmetric JWT signing keys, `getClaims()` verifies the access token locally
 * (WebCrypto + cached JWKS) with no Auth-server roundtrip — this is what the
 * proxy adds to TTFB on *every* request, so it directly bounds First Contentful
 * Paint. `getUser()` instead hit the Auth server on each navigation. `getClaims`
 * still refreshes expired tokens and writes the rotated cookies via `setAll`,
 * and it's Supabase's documented recommendation for gating in the proxy. (It
 * validates signature + expiry, not server-side revocation — the same trade-off
 * already accepted client-side in `lib/hooks/use-workspace.ts`.)
 *
 * Composed on top of next-intl: `i18nResponse` is the locale middleware's
 * response (carrying the NEXT_LOCALE cookie and the internal `[locale]` rewrite).
 * We set the refreshed auth cookies onto it and return it on the happy path, so
 * locale routing and the auth session survive together. Auth redirects copy the
 * pending cookies across so the session refresh isn't lost.
 */
export async function updateSession(
  request: NextRequest,
  i18nResponse: NextResponse,
) {
  const response = i18nResponse;

  // If Supabase isn't configured for this environment (e.g. env vars set only
  // for Production on Vercel, so Preview deploys have none), don't 500 every
  // route from the proxy. Pass the request through with a legible warning;
  // routes that genuinely need data surface their own clear error.
  if (!isSupabaseConfigured()) {
    console.error(
      "[proxy] Skipping auth gating: Supabase env vars are missing for this " +
        "environment. Set NEXT_PUBLIC_SUPABASE_URL and " +
        "NEXT_PUBLIC_SUPABASE_ANON_KEY in the Vercel project settings for all " +
        "environments (Production, Preview, Development).",
    );
    return response;
  }

  // Auth cookies refreshed by Supabase, captured so an auth redirect can carry
  // them too (a fresh NextResponse.redirect would otherwise drop the refresh).
  const pending: { name: string; value: string; options: object }[] = [];

  const { url: supabaseUrl, anonKey } = getSupabaseConfig();

  const supabase = createServerClient(supabaseUrl, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
          pending.push({ name, value, options: options ?? {} });
        });
      },
    },
  });

  // Do not run code between createServerClient and getClaims() — Supabase
  // guidance, a stray statement here can cause hard-to-debug random logouts.
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims; // truthy when authenticated; used only for gating

  const path = request.nextUrl.pathname;
  const prefix = localeOf(path) === "ru" ? "/ru" : "";
  const loginPath = `${prefix}/login`;
  const calendarPath = `${prefix}/calendar`;
  const onAuthRoute = path === loginPath;
  const isHome = path === "/" || path === "/ru";

  const redirectTo = (pathname: string) => {
    const url = request.nextUrl.clone();
    url.pathname = pathname;
    const redirect = NextResponse.redirect(url);
    pending.forEach(({ name, value, options }) =>
      redirect.cookies.set(name, value, options),
    );
    return redirect;
  };

  if (!user && !onAuthRoute) return redirectTo(loginPath);
  if (user && (onAuthRoute || isHome)) return redirectTo(calendarPath);

  return response;
}
