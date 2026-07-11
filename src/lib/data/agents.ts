import { createClient } from "@/lib/supabase/server";
import type { AgentName } from "@/lib/agents/report";

export interface AgentRun {
  id: string;
  agent: AgentName;
  status: string;
  report: Record<string, unknown>;
  created_at: string;
}

/** The most recent run of each agent for an org (RLS: org members may read). */
export async function latestRuns(orgId: string): Promise<Partial<Record<AgentName, AgentRun>>> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("agent_runs")
    .select("id, agent, status, report, created_at")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });

  const latest: Partial<Record<AgentName, AgentRun>> = {};
  for (const r of (data ?? []) as AgentRun[]) {
    if (!latest[r.agent]) latest[r.agent] = r;
  }
  return latest;
}
