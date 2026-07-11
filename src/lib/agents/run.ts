import type { SupabaseClient } from "@supabase/supabase-js";
import { fromPgVector } from "@/lib/ai/embed";
import { countByType, duplicatePairs, type AgentName, type EmbeddedNode } from "./report";

export type AgentReport = Record<string, unknown>;

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Weekly digest: what's new, plus the health counters an admin should watch. */
async function runDigest(supabase: SupabaseClient, orgId: string): Promise<AgentReport> {
  const since = new Date(Date.now() - WEEK_MS).toISOString();
  const [{ data: recent }, total, gaps, stale] = await Promise.all([
    supabase.from("nodes").select("type").eq("org_id", orgId).gte("created_at", since),
    supabase.from("nodes").select("*", { count: "exact", head: true }).eq("org_id", orgId),
    supabase
      .from("questions_log")
      .select("*", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("answered", false),
    supabase
      .from("nodes")
      .select("*", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("status", "stale"),
  ]);
  const rows = (recent ?? []) as { type: string }[];
  return {
    newThisWeek: rows.length,
    byType: countByType(rows),
    totalNodes: total.count ?? 0,
    openGaps: gaps.count ?? 0,
    staleNodes: stale.count ?? 0,
  };
}

/** Stale scan: flip old draft/reviewed nodes to `stale` (RLS-bounded to writable). */
async function runStale(supabase: SupabaseClient, orgId: string): Promise<AgentReport> {
  const { data } = await supabase.rpc("mark_stale_nodes", { p_org: orgId, p_days: 90 });
  const marked = (data ?? []) as { id: string; title: string }[];
  return { marked: marked.length, titles: marked.map((n) => n.title).slice(0, 20) };
}

/** Gap report: questions the brain couldn't answer, newest first. */
async function runGap(supabase: SupabaseClient, orgId: string): Promise<AgentReport> {
  const { data } = await supabase
    .from("questions_log")
    .select("question, created_at")
    .eq("org_id", orgId)
    .eq("answered", false)
    .order("created_at", { ascending: false })
    .limit(25);
  const rows = (data ?? []) as { question: string; created_at: string }[];
  return { openGaps: rows.length, questions: rows.map((r) => r.question) };
}

/** Duplicate scan: near-identical nodes by embedding cosine similarity. */
async function runDedupe(supabase: SupabaseClient, orgId: string): Promise<AgentReport> {
  const { data } = await supabase
    .from("embeddings")
    .select("node_id, embedding, nodes(title)")
    .eq("org_id", orgId);
  type Row = { node_id: string; embedding: string; nodes: { title: string } | null };
  const nodes: EmbeddedNode[] = ((data ?? []) as unknown as Row[]).map((r) => ({
    id: r.node_id,
    title: r.nodes?.title ?? "(untitled)",
    embedding: fromPgVector(r.embedding),
  }));
  const pairs = duplicatePairs(nodes, 0.9);
  return { pairs: pairs.length, top: pairs.slice(0, 10) };
}

/**
 * Run a maintenance agent and record the run. The agent_runs insert is
 * RLS-gated to owner/admin, so a non-admin caller is rejected there.
 */
export async function runAgent(
  supabase: SupabaseClient,
  orgId: string,
  agent: AgentName,
  userId?: string | null,
): Promise<{ report: AgentReport }> {
  const report =
    agent === "digest"
      ? await runDigest(supabase, orgId)
      : agent === "stale"
        ? await runStale(supabase, orgId)
        : agent === "gap"
          ? await runGap(supabase, orgId)
          : await runDedupe(supabase, orgId);

  const { error } = await supabase
    .from("agent_runs")
    .insert({ org_id: orgId, agent, status: "ok", report, created_by: userId ?? null });
  if (error) throw new Error(error.message);

  return { report };
}
