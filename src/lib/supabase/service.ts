import { createClient } from "@supabase/supabase-js";
import { serviceRoleKey, supabaseUrl } from "@/lib/env";

/**
 * Privileged Supabase client that BYPASSES RLS. Use ONLY in trusted server
 * contexts with no user session — currently the cron job, which must operate
 * across every org. Never import this into a request handler that serves a
 * user; those must use the cookie-scoped client so RLS applies.
 */
export function createServiceClient() {
  return createClient(supabaseUrl(), serviceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
