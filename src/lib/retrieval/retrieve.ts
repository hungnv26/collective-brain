import type { SupabaseClient } from "@supabase/supabase-js";
import { embed, toPgVector } from "@/lib/ai/embed";
import type { Node } from "@/lib/types";

export interface Source {
  n: number;
  id: string;
  title: string;
  type: string;
  space_id: string;
  body_md: string;
  linked?: boolean; // pulled in via 1-hop expansion, not a direct hit
}

export interface Retrieval {
  sources: Source[];
  context: string;
}

const RRF_K = 60;
const MAX_DIRECT = 6;
const MAX_TOTAL = 8;
const BODY_CAP = 900;

/**
 * Hybrid retrieval (plan §retrieval): vector top-K ∪ keyword top-K, fused with
 * reciprocal-rank fusion, then expanded one hop along links. RLS guarantees
 * only nodes the asker may read are ever returned — permissions are applied
 * before any content reaches the model.
 */
export async function retrieve(
  supabase: SupabaseClient,
  orgId: string,
  query: string,
): Promise<Retrieval> {
  const [{ data: vec }, { data: kw }] = await Promise.all([
    supabase.rpc("match_nodes", { p_org: orgId, p_embedding: toPgVector(embed(query)), p_k: 8 }),
    supabase.rpc("search_nodes", { p_org: orgId, p_query: query }),
  ]);

  // Reciprocal-rank fusion over the two rankings.
  const score = new Map<string, number>();
  const bump = (id: string, rank: number) => score.set(id, (score.get(id) ?? 0) + 1 / (RRF_K + rank));
  ((vec ?? []) as { node_id: string }[]).forEach((r, i) => bump(r.node_id, i));
  ((kw ?? []) as { id: string }[]).forEach((r, i) => bump(r.id, i));

  const directIds = [...score.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_DIRECT)
    .map(([id]) => id);

  if (directIds.length === 0) return { sources: [], context: "" };

  // One-hop expansion along links from the direct hits.
  const { data: links } = await supabase
    .from("links")
    .select("to_node")
    .in("from_node", directIds);
  const linkedIds = [...new Set((links ?? []).map((l) => (l as { to_node: string }).to_node))].filter(
    (id) => !directIds.includes(id),
  );

  const allIds = [...directIds, ...linkedIds].slice(0, MAX_TOTAL);
  const { data: rows } = await supabase.from("nodes").select("*").in("id", allIds);
  const byId = new Map((rows ?? []).map((r) => [(r as Node).id, r as Node]));

  const sources: Source[] = [];
  let n = 1;
  for (const id of allIds) {
    const node = byId.get(id);
    if (!node) continue; // RLS may have filtered a linked node
    sources.push({
      n: n++,
      id: node.id,
      title: node.title,
      type: node.type,
      space_id: node.space_id,
      body_md: node.body_md,
      linked: !directIds.includes(id),
    });
  }

  const context = sources
    .map((s) => `[${s.n}] (${s.type}) ${s.title}\n${s.body_md.slice(0, BODY_CAP)}`)
    .join("\n\n");

  return { sources, context };
}
