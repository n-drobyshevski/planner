import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseConfig, isSupabaseConfigured } from "./env";

/**
 * Refresh the Supabase session cookie on each request and gate routes:
 * unauthenticated -> /select-profile; authenticated on "/" or /select-profile
 * -> /calendar.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

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

  const { url: supabaseUrl, anonKey } = getSupabaseConfig();

  const supabase = createServerClient(
    supabaseUrl,
    anonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const onAuthRoute = path === "/select-profile";

  if (!user && !onAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/select-profile";
    return NextResponse.redirect(url);
  }
  if (user && (onAuthRoute || path === "/")) {
    const url = request.nextUrl.clone();
    url.pathname = "/calendar";
    return NextResponse.redirect(url);
  }

  return response;
}
