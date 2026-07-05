import { createClient } from "@/lib/supabase/server";
import { parseWikilinks } from "@/lib/nodes/wikilinks";
import type { Node, NodeVersion, Space } from "@/lib/types";

/** A single space by id (RLS: null if not readable). */
export async function getSpace(spaceId: string): Promise<Space | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("spaces").select("*").eq("id", spaceId).maybeSingle();
  return (data as Space | null) ?? null;
}

/** Nodes in a space, newest first (RLS-filtered). */
export async function listSpaceNodes(spaceId: string): Promise<Node[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("nodes")
    .select("*")
    .eq("space_id", spaceId)
    .order("updated_at", { ascending: false });
  return (data ?? []) as Node[];
}

export async function getNode(id: string): Promise<Node | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("nodes").select("*").eq("id", id).maybeSingle();
  return (data as Node | null) ?? null;
}

/** Nodes that link to this node (backlinks), via the related-links table. */
export async function getBacklinks(nodeId: string): Promise<Node[]> {
  const supabase = await createClient();
  const { data: links } = await supabase.from("links").select("from_node").eq("to_node", nodeId);
  const sourceIds = [...new Set((links ?? []).map((l) => (l as { from_node: string }).from_node))];
  if (sourceIds.length === 0) return [];
  const { data } = await supabase
    .from("nodes")
    .select("*")
    .in("id", sourceIds)
    .order("updated_at", { ascending: false });
  return (data ?? []) as Node[];
}

export async function getVersions(nodeId: string): Promise<NodeVersion[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("node_versions")
    .select("id, node_id, body_md, edited_by, created_at")
    .eq("node_id", nodeId)
    .order("created_at", { ascending: false });
  return (data ?? []) as NodeVersion[];
}

/**
 * Resolve the [[wikilinks]] in a body to a slug → node map (RLS-filtered), so
 * the viewer can turn them into real links.
 */
export async function resolveWikilinkMap(
  orgId: string,
  body: string,
): Promise<Map<string, { id: string; title: string }>> {
  const slugs = [...new Set(parseWikilinks(body).map((w) => w.slug))];
  const map = new Map<string, { id: string; title: string }>();
  if (slugs.length === 0) return map;
  const supabase = await createClient();
  const { data } = await supabase
    .from("nodes")
    .select("id, title, slug")
    .eq("org_id", orgId)
    .in("slug", slugs);
  for (const n of (data ?? []) as { id: string; title: string; slug: string }[]) {
    map.set(n.slug, { id: n.id, title: n.title });
  }
  return map;
}

/** Full-text search across the org's readable nodes. */
export async function searchNodes(orgId: string, query: string): Promise<Node[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("search_nodes", { p_org: orgId, p_query: query });
  return (data ?? []) as Node[];
}
