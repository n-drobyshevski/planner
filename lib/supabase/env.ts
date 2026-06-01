/**
 * Single source of truth for the public Supabase env vars, plus a legible error
 * when they're missing.
 *
 * The clients used to read `process.env.NEXT_PUBLIC_SUPABASE_URL!` directly, so
 * a missing var surfaced as an opaque "supabaseUrl is required" 500 — exactly
 * what happened when the vars were scoped to the Production environment on
 * Vercel and every Preview deploy crashed in `proxy.ts`. Centralizing makes the
 * failure name the culprit and lets the proxy degrade gracefully.
 *
 * NOTE: references must be *static* `process.env.NEXT_PUBLIC_*` (not dynamic
 * indexing) so Turbopack can inline them into the browser bundle.
 */

/** True when both public Supabase vars are present. */
export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

/**
 * Returns the validated public Supabase config, or throws an error naming the
 * missing variable(s) and where to set them.
 */
export function getSupabaseConfig(): { url: string; anonKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const missing = [
    !url && "NEXT_PUBLIC_SUPABASE_URL",
    !anonKey && "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  ].filter(Boolean);

  if (missing.length > 0) {
    throw new Error(
      `Missing Supabase environment variable(s): ${missing.join(", ")}. ` +
        `Add them to .env.local for local dev, and in Vercel → Project → ` +
        `Settings → Environment Variables — make sure they're enabled for ` +
        `ALL environments (Production, Preview, Development), not just Production.`,
    );
  }

  return { url: url!, anonKey: anonKey! };
}
