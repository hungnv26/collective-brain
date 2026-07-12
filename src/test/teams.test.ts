import { beforeEach, describe, expect, test } from "vitest";
import { asUser, freshDb, type Db } from "./db";
import { seedOrg, type SeededOrg } from "./seed";

let db: Db;
let A: SeededOrg;

const one = <T>(r: { rows: unknown[] }) => r.rows[0] as T;

beforeEach(async () => {
  db = await freshDb();
  A = await seedOrg(db, "teams");
});

describe("team management is owner/admin only", () => {
  test("owner creates a team; a plain member cannot", async () => {
    const id = await asUser(db, A.owner.id, async (q) =>
      one<{ id: string }>(await q("insert into teams (org_id, name) values ($1,'Squad') returning id", [A.id])).id,
    );
    expect(id).toBeTruthy();

    await expect(
      asUser(db, A.member.id, async (q) => {
        await q("insert into teams (org_id, name) values ($1,'Sneak')", [A.id]);
      }),
    ).rejects.toThrow();
  });

  test("owner adds a team member; a plain member cannot", async () => {
    await asUser(db, A.owner.id, async (q) => {
      await q("insert into team_members (team_id, user_id) values ($1,$2)", [A.teamId, A.member.id]);
    });
    const seen = await asUser(db, A.member.id, async (q) =>
      one<{ n: number }>(await q("select count(*)::int n from team_members where team_id=$1", [A.teamId])),
    );
    expect(seen.n).toBeGreaterThanOrEqual(2); // seeded owner-lead + member

    await expect(
      asUser(db, A.member.id, async (q) => {
        await q("insert into team_members (team_id, user_id) values ($1,$2)", [A.teamId, A.outsider.id]);
      }),
    ).rejects.toThrow();
  });
});

describe("team space visibility follows team membership", () => {
  test("a non-team member can't read the team's nodes; joining grants access", async () => {
    const before = await asUser(db, A.member.id, async (q) =>
      one<{ n: number }>(await q("select count(*)::int n from nodes where id=$1", [A.teamNodeId])),
    );
    expect(before.n).toBe(0); // member isn't on the team

    await asUser(db, A.owner.id, async (q) => {
      await q("insert into team_members (team_id, user_id) values ($1,$2)", [A.teamId, A.member.id]);
    });

    const after = await asUser(db, A.member.id, async (q) =>
      one<{ n: number }>(await q("select count(*)::int n from nodes where id=$1", [A.teamNodeId])),
    );
    expect(after.n).toBe(1); // now on the team → readable
  });

  test("owner can create a team space; a plain member cannot", async () => {
    // NB: no RETURNING — INSERT ... RETURNING re-runs can_read_space against the
    // not-yet-visible new row and fails RLS even for an allowed insert (the API
    // route avoids RETURNING for the same reason).
    await asUser(db, A.owner.id, async (q) => {
      await q("insert into spaces (org_id, kind, team_id, name) values ($1,'team',$2,'Squad Space')", [
        A.id,
        A.teamId,
      ]);
    });
    const created = await asUser(db, A.owner.id, async (q) =>
      one<{ n: number }>(
        await q("select count(*)::int n from spaces where org_id=$1 and kind='team' and name='Squad Space'", [A.id]),
      ),
    );
    expect(created.n).toBe(1);

    await expect(
      asUser(db, A.member.id, async (q) => {
        await q("insert into spaces (org_id, kind, team_id, name) values ($1,'team',$2,'Nope')", [A.id, A.teamId]);
      }),
    ).rejects.toThrow();
  });
});

describe("cross-org isolation", () => {
  test("an outsider cannot see another org's teams", async () => {
    const B = await seedOrg(db, "teams-other");
    const n = await asUser(db, B.owner.id, async (q) =>
      one<{ n: number }>(await q("select count(*)::int n from teams where org_id=$1", [A.id])),
    );
    expect(n.n).toBe(0);
  });
});
