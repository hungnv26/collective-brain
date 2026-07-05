import { createBrowserClient } from "@supabase/ssr";
import { supabaseAnonKey, supabaseUrl } from "@/lib/env";

/** Supabase client for Client Components (browser). */
export function createClient() {
  return createBrowserClient(supabaseUrl(), supabaseAnonKey());
}
