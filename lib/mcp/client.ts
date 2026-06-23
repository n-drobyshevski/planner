import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "@/lib/supabase/env";

/**
 * A Supabase client that acts as the member who owns `accessToken`. The token is
 * a Supabase-issued OAuth access token (a normal Supabase JWT); attaching it as
 * the `Authorization` header makes every PostgREST request run under that
 * member's identity, so **RLS applies exactly as it does in the browser** — the
 * MCP server never bypasses it (unlike the service-role admin client).
 *
 * Sessionless: we never persist or refresh — each MCP request carries its own
 * bearer token, validated upstream by `verifyMcpToken`.
 */
export function clientForToken(accessToken: string): SupabaseClient {
  const { url, anonKey } = getSupabaseConfig();
  return createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
