/**
 * Canonical origin for user-facing absolute links (e.g. public share URLs).
 *
 * Prefers `NEXT_PUBLIC_SITE_URL` — set in Vercel Production so links are
 * brand-correct and host-independent (a link copied from a `*.vercel.app`
 * preview still points at the production domain). Falls back to the browser
 * origin for local dev and preview deploys, where the var is intentionally
 * unset so links match whatever host you're testing on.
 *
 * NOTE: the reference must be a *static* `process.env.NEXT_PUBLIC_*` (not
 * dynamic indexing) so Turbopack can inline it into the browser bundle — same
 * constraint as `lib/supabase/env.ts`.
 *
 * Returns `undefined` only during SSR with the var unset; callers should fall
 * back to a relative path in that case.
 */
export function getSiteOrigin(): string | undefined {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL;
  if (fromEnv) return fromEnv.replace(/\/+$/, ""); // strip trailing slash(es)
  if (typeof window !== "undefined") return window.location.origin;
  return undefined;
}
