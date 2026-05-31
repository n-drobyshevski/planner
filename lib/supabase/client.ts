import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | undefined;

/**
 * Browser Supabase client (publishable key), memoized as a singleton so we
 * don't spin up multiple GoTrue instances. Reads the session cookie.
 */
export function createClient(): SupabaseClient {
  return (browserClient ??= createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  ));
}
