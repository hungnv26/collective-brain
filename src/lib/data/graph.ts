import { createClient } from "@/lib/supabase/server";

/** A node as the graph view needs it — light projection, no bodies. */
export interface GraphNode {
  id: string;
  title: string;
  type: string;
  space_id: string;
}

/** An edge between two readable nodes. */
export interface GraphEdge {
  from: string;
  to: string;
  rel: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/**
 * Assemble the graph from the two RLS-filtered result sets, keeping only edges
 * whose BOTH endpoints are in the readable node set.
 *
 * This second check is load-bearing, not belt-and-braces: the `links_select`
 * RLS policy gates on `node_readable(from_node)` only, so a link from a node
 * you can read to one in a private space you cannot read is still returned by
 * the database. Dropping it here keeps a private node's very id from leaking
 * through a visible link's `to_node`, and keeps the graph from dangling.
 */
export function assembleGraph(
  nodeRows: GraphNode[],
  linkRows: { from_node: string; to_node: string; rel: string }[],
): GraphData {
  const nodes = nodeRows;
  const visible = new Set(nodes.map((n) => n.id));

  const edges: GraphEdge[] = [];
  for (const l of linkRows) {
    if (visible.has(l.from_node) && visible.has(l.to_node)) {
      edges.push({ from: l.from_node, to: l.to_node, rel: l.rel });
    }
  }

  return { nodes, edges };
}

/**
 * The org's knowledge graph, as the /graph view draws it. Both queries are
 * RLS-filtered, so a caller only ever gets nodes and links they may read —
 * permissions are applied in the database, before any content reaches the
 * client (same invariant as retrieval/Ask).
 */
export async function getOrgGraph(orgId: string): Promise<GraphData> {
  const supabase = await createClient();
  const [{ data: nodeRows }, { data: linkRows }] = await Promise.all([
    supabase.from("nodes").select("id, title, type, space_id").eq("org_id", orgId),
    supabase.from("links").select("from_node, to_node, rel").eq("org_id", orgId),
  ]);

  return assembleGraph(
    (nodeRows ?? []) as GraphNode[],
    (linkRows ?? []) as { from_node: string; to_node: string; rel: string }[],
  );
}
