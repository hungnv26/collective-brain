import { beforeEach, describe, expect, test } from "vitest";
import { asUser, freshDb, type Db } from "./db";
import { seedOrg, type SeededOrg } from "./seed";
import { countByType, duplicatePairs, type EmbeddedNode } from "@/lib/agents/report";

let db: Db;
let A: SeededOrg;

const one = <T>(r: { rows: unknown[] }) => r.rows[0] as T;

describe("pure agent helpers", () => {
  test("countByType tallies node types", () => {
    expect(countByType([{ type: "fact" }, { type: "fact" }, { type: "idea" }])).toEqual({
      fact: 2,
      idea: 1,
    });
  });

  test("duplicatePairs returns near-identical pairs above threshold, best first", () => {
    const nodes: EmbeddedNode[] = [
      { id: "1", title: "A", embedding: [1, 0, 0] },
      { id: "2", title: "B", embedding: [1, 0, 0] }, // identical to A
      { id: "3", title: "C", embedding: [0, 1, 0] }, // orthogonal
    ];
    const pairs = duplicatePairs(nodes, 0.9);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]).toMatchObject({ a: "1", b: "2" });
    expect(pairs[0].score).toBeCloseTo(1, 5);
  });
});

describe("agent_runs RLS + mark_stale_nodes", () => {
  beforeEach(async () => {
    db = await freshDb();
    A = await seedOrg(db, "agents");
  });

  test("owner records a run; a member can read it but cannot create one", async () => {
    await asUser(db, A.owner.id, async (q) => {
      await q(
        "insert into agent_runs (org_id, agent, report, created_by) values ($1,'digest','{\"newThisWeek\":3}'::jsonb, auth.uid())",
        [A.id],
      );
    });

    const memberSees = await asUser(db, A.member.id, async (q) =>
      one<{ n: number }>(await q("select count(*)::int n from agent_runs where org_id=$1", [A.id])),
    );
    expect(memberSees.n).toBe(1);

    await expect(
      asUser(db, A.member.id, async (q) => {
        await q("insert into agent_runs (org_id, agent, report) values ($1,'gap','{}'::jsonb)", [A.id]);
      }),
    ).rejects.toThrow();
  });

  test("another org cannot see this org's runs", async () => {
    await asUser(db, A.owner.id, async (q) => {
      await q("insert into agent_runs (org_id, agent, report) values ($1,'digest','{}'::jsonb)", [A.id]);
    });
    const B = await seedOrg(db, "agents-other");
    const outsider = await asUser(db, B.owner.id, async (q) =>
      one<{ n: number }>(await q("select count(*)::int n from agent_runs where org_id=$1", [A.id])),
    );
    expect(outsider.n).toBe(0);
  });

  test("mark_stale_nodes flips only old draft/reviewed org nodes", async () => {
    // Backdate the seeded org node so it qualifies; add a fresh one that shouldn't.
    await db.exec("reset role");
    await db.query("update nodes set status='reviewed', updated_at = now() - interval '200 days' where id=$1", [
      A.orgNodeId,
    ]);
    const fresh = one<{ id: string }>(
      await db.query(
        "insert into nodes (org_id, space_id, type, title, slug, body_md, status) values ($1,$2,'fact','Fresh','fresh','x','reviewed') returning id",
        [A.id, A.orgSpaceId],
      ),
    ).id;

    const marked = await asUser(db, A.owner.id, async (q) =>
      (await q("select id from mark_stale_nodes($1, 90)", [A.id])).rows as { id: string }[],
    );
    expect(marked.map((m) => m.id)).toContain(A.orgNodeId);
    expect(marked.map((m) => m.id)).not.toContain(fresh);

    const status = await asUser(db, A.owner.id, async (q) =>
      one<{ status: string }>(await q("select status from nodes where id=$1", [A.orgNodeId])),
    );
    expect(status.status).toBe("stale");
  });

  test("mark_stale_nodes never touches another member's private node", async () => {
    // Owner's private node, backdated. An admin running the scan can't write it.
    await db.exec("reset role");
    await db.query("update nodes set status='reviewed', updated_at = now() - interval '200 days' where id=$1", [
      A.privateNodeId,
    ]);

    // The member (non-owner) runs the scan; RLS bounds it to nodes they can write.
    await asUser(db, A.member.id, async (q) => {
      await q("select id from mark_stale_nodes($1, 90)", [A.id]);
    });

    const status = await asUser(db, A.owner.id, async (q) =>
      one<{ status: string }>(await q("select status from nodes where id=$1", [A.privateNodeId])),
    );
    expect(status.status).toBe("reviewed"); // untouched — it's in the owner's private space
  });
});
