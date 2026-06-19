import {
  createClient as createSupabaseClient,
  type SupabaseClient,
} from "@supabase/supabase-js";
import { getSupabaseConfig } from "./env";

/**
 * A cookieless anon Supabase client for the PUBLIC (unauthenticated) share path.
 *
 * No session, no persistence — it carries the `anon` role only. The single thing
 * it can reach are the `public_*` SECURITY DEFINER RPCs (the strict public read +
 * the rate-limited request insert); the events/tasks tables stay locked by RLS,
 * which `anon` never satisfies. Safe on the server (the /share route + the request
 * API route) and, if ever needed, the client. Distinct from `lib/supabase/client`
 * (browser, session-backed) and `lib/supabase/admin` (service-role, server-only).
 */
export function createPublicClient(): SupabaseClient {
  const { url, anonKey } = getSupabaseConfig();
  return createSupabaseClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
