import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client (bypasses RLS). SERVER ONLY — never import into
 * a client component. Used for the pre-auth PIN lookup and seeding.
 */
export function createAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const missing = [
    !url && "NEXT_PUBLIC_SUPABASE_URL",
    !serviceRoleKey && "SUPABASE_SERVICE_ROLE_KEY",
  ].filter(Boolean);

  if (missing.length > 0) {
    throw new Error(
      `Missing Supabase environment variable(s): ${missing.join(", ")}. ` +
        `SUPABASE_SERVICE_ROLE_KEY is server-only (never NEXT_PUBLIC_). Set ` +
        `these in .env.local and in the Vercel project settings for all ` +
        `environments that run server code.`,
    );
  }

  return createClient(url!, serviceRoleKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
