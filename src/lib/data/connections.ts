import { createClient } from "@/lib/supabase/server";
import type { Provider } from "@/lib/connectors/types";

export interface ConnectionRow {
  id: string;
  provider: Provider;
  status: string;
  target_space_id: string | null;
  config: Record<string, unknown>;
  last_synced_at: string | null;
  last_error: string | null;
}

/** Connections for an org (RLS: org members read; secrets are never selected). */
export async function listConnections(orgId: string): Promise<ConnectionRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("connections")
    .select("id, provider, status, target_space_id, config, last_synced_at, last_error")
    .eq("org_id", orgId)
    .order("created_at", { ascending: true });
  return (data ?? []) as ConnectionRow[];
}
