import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "./env";

let browserClient: SupabaseClient | undefined;

/**
 * Browser Supabase client (publishable key), memoized as a singleton so we
 * don't spin up multiple GoTrue instances. Reads the session cookie.
 */
export function createClient(): SupabaseClient {
  if (browserClient) return browserClient;
  const { url, anonKey } = getSupabaseConfig();
  return (browserClient = createBrowserClient(url, anonKey));
}
