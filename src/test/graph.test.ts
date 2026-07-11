import { beforeAll, describe, expect, test } from "vitest";
import { asUser, freshDb, type Db } from "./db";
import { seedOrg, type SeededOrg } from "./seed";
import { assembleGraph, type GraphNode } from "@/lib/data/graph";

let db: Db;
let A: SeededOrg;

const rows = <T>(r: { rows: unknown[] }) => r.rows as T[];

// Replicate getOrgGraph's two RLS-filtered reads at the SQL level, for a given
// user, then assemble the graph exactly as the app does.
async function graphFor(userId: string, orgId: string) {
  return asUser(db, userId, async (q) => {
    const nodeRows = rows<GraphNode>(
      await q("select id, title, type, space_id from nodes where org_id=$1", [orgId]),
    );
    const linkRows = rows<{ from_node: string; to_node: string; rel: string }>(
      await q("select from_node, to_node, rel from links where org_id=$1", [orgId]),
    );
    return { nodeRows, linkRows, graph: assembleGraph(nodeRows, linkRows) };
  });
}

beforeAll(async () => {
  db = await freshDb();
  A = await seedOrg(db, "graph");

  // Owner links a readable org node -> their private node. Owner can read both,
  // so the insert passes links_insert (node_writable(from) & node_readable(to)).
  await asUser(db, A.owner.id, async (q) => {
    await q(
      "insert into links (org_id, from_node, to_node, rel) values ($1,$2,$3,'related')",
      [A.id, A.orgNodeId, A.privateNodeId],
    );
  });
});

describe("assembleGraph — pure edge filtering", () => {
  test("keeps edges whose endpoints are both visible, drops the rest", () => {
    const nodes: GraphNode[] = [
      { id: "a", title: "A", type: "fact", space_id: "s" },
      { id: "b", title: "B", type: "idea", space_id: "s" },
    ];
    const links = [
      { from_node: "a", to_node: "b", rel: "related" }, // both visible → kept
      { from_node: "a", to_node: "ghost", rel: "supports" }, // to hidden → dropped
      { from_node: "ghost", to_node: "b", rel: "extends" }, // from hidden → dropped
    ];
    const g = assembleGraph(nodes, links);
    expect(g.edges).toEqual([{ from: "a", to: "b", rel: "related" }]);
  });
});

describe("org graph respects RLS", () => {
  test("owner sees both nodes and the linking edge", async () => {
    const { graph } = await graphFor(A.owner.id, A.id);
    const ids = new Set(graph.nodes.map((n) => n.id));
    expect(ids.has(A.orgNodeId)).toBe(true);
    expect(ids.has(A.privateNodeId)).toBe(true);
    expect(graph.edges).toContainEqual({ from: A.orgNodeId, to: A.privateNodeId, rel: "related" });
  });

  test("member never sees the private node — nor a dangling edge to it", async () => {
    const { linkRows, graph } = await graphFor(A.member.id, A.id);

    // The private node is not in the member's readable node set.
    expect(graph.nodes.some((n) => n.id === A.privateNodeId)).toBe(false);

    // links_select only gates on from_node, so RLS DID hand the member a raw
    // link pointing at the private node — proving the app-side filter matters.
    expect(linkRows.some((l) => l.to_node === A.privateNodeId)).toBe(true);

    // After assembly, no edge references the private node's id at all.
    const leaks = graph.edges.some(
      (e) => e.from === A.privateNodeId || e.to === A.privateNodeId,
    );
    expect(leaks).toBe(false);
  });

  test("an outsider (different org) sees nothing from this org", async () => {
    const B = await seedOrg(db, "graph-outsider");
    const { graph } = await graphFor(B.owner.id, A.id);
    expect(graph.nodes).toHaveLength(0);
    expect(graph.edges).toHaveLength(0);
  });
});
