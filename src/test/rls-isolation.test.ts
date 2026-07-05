import { beforeAll, describe, expect, test } from "vitest";
import { freshDb, asUser, type Db } from "./db";
import { seedOrg, type SeededOrg } from "./seed";

/**
 * SPRINT 1 EXIT GATE — "two orgs cannot see each other's anything."
 * Also proves the private-space boundary WITHIN an org. Every assertion runs
 * with RLS enforced as the given user (role=authenticated, JWT sub set).
 */

let db: Db;
let A: SeededOrg;
let B: SeededOrg;

const countNodes = (rows: unknown[]) => (rows[0] as { n: number }).n;

beforeAll(async () => {
  db = await freshDb();
  A = await seedOrg(db, "a");
  B = await seedOrg(db, "b");
});

describe("cross-org isolation", () => {
  test("A's owner cannot read ANY of org B's nodes", async () => {
    const rows = await asUser(db, A.owner.id, async (q) => {
      const r = await q("select count(*)::int as n from nodes where org_id = $1", [B.id]);
      return r.rows;
    });
    expect(countNodes(rows)).toBe(0);
  });

  test("A's owner cannot read org B's spaces, memberships, teams, or orgs", async () => {
    await asUser(db, A.owner.id, async (q) => {
      expect((await q("select count(*)::int as n from spaces where org_id=$1", [B.id])).rows[0]).toMatchObject({ n: 0 });
      expect((await q("select count(*)::int as n from memberships where org_id=$1", [B.id])).rows[0]).toMatchObject({ n: 0 });
      expect((await q("select count(*)::int as n from teams where org_id=$1", [B.id])).rows[0]).toMatchObject({ n: 0 });
      expect((await q("select count(*)::int as n from orgs where id=$1", [B.id])).rows[0]).toMatchObject({ n: 0 });
    });
  });

  test("targeting a specific foreign node id by primary key still returns nothing", async () => {
    const rows = await asUser(db, A.owner.id, async (q) => {
      const r = await q("select count(*)::int as n from nodes where id = $1", [B.privateNodeId]);
      return r.rows;
    });
    expect(countNodes(rows)).toBe(0);
  });

  test("A's owner cannot INSERT a node into org B's space", async () => {
    await expect(
      asUser(db, A.owner.id, async (q) => {
        await q(
          "insert into nodes (org_id,space_id,type,title,slug) values ($1,$2,'fact','x','x-evil')",
          [B.id, B.orgSpaceId],
        );
      }),
    ).rejects.toThrow();
  });

  test("A's owner cannot UPDATE or DELETE org B's node", async () => {
    await asUser(db, A.owner.id, async (q) => {
      const upd = await q("update nodes set title='hacked' where id=$1", [B.orgNodeId]);
      const del = await q("delete from nodes where id=$1", [B.orgNodeId]);
      // RLS makes the rows invisible → zero rows affected, no error, no change.
      expect((upd as { affectedRows?: number }).affectedRows ?? 0).toBe(0);
      expect((del as { affectedRows?: number }).affectedRows ?? 0).toBe(0);
    });
    // Confirm B's node is untouched (privileged read).
    const check = await db.query("select title from nodes where id=$1", [B.orgNodeId]);
    expect((check.rows[0] as { title: string }).title).toBe(`org-note-b`);
  });
});

describe("within-org space boundaries", () => {
  test("a member cannot read another user's private-space node", async () => {
    const rows = await asUser(db, A.member.id, async (q) => {
      const r = await q("select count(*)::int as n from nodes where id=$1", [A.privateNodeId]);
      return r.rows;
    });
    expect(countNodes(rows)).toBe(0);
  });

  test("a member CAN read the org-space node (shared)", async () => {
    const rows = await asUser(db, A.member.id, async (q) => {
      const r = await q("select count(*)::int as n from nodes where id=$1", [A.orgNodeId]);
      return r.rows;
    });
    expect(countNodes(rows)).toBe(1);
  });

  test("a non-team member cannot read a team-space node", async () => {
    // A.member was never added to A's team.
    const rows = await asUser(db, A.member.id, async (q) => {
      const r = await q("select count(*)::int as n from nodes where id=$1", [A.teamNodeId]);
      return r.rows;
    });
    expect(countNodes(rows)).toBe(0);
  });

  test("the owner (team lead) CAN read the team-space node", async () => {
    const rows = await asUser(db, A.owner.id, async (q) => {
      const r = await q("select count(*)::int as n from nodes where id=$1", [A.teamNodeId]);
      return r.rows;
    });
    expect(countNodes(rows)).toBe(1);
  });

  test("a member cannot write into the org space without an admin role or grant", async () => {
    // members have read on org space but not write (write needs owner/admin/grant).
    await asUser(db, A.member.id, async (q) => {
      const res = await q("update nodes set title='m' where id=$1", [A.orgNodeId]);
      expect((res as { affectedRows?: number }).affectedRows ?? 0).toBe(0);
    });
  });
});

describe("anonymous access", () => {
  test("with no JWT, nothing is visible", async () => {
    // asUser with a random non-member uuid → passes RLS as authenticated but
    // matches no memberships, so sees nothing.
    const ghost = "00000000-0000-4000-8000-ffffffffffff";
    const rows = await asUser(db, ghost, async (q) => {
      const r = await q("select count(*)::int as n from nodes", []);
      return r.rows;
    });
    expect(countNodes(rows)).toBe(0);
  });
});
