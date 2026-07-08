import { beforeAll, describe, expect, test } from "vitest";
import { asAdmin, asUser, freshDb, type Db } from "./db";
import { seedOrg, type SeededOrg } from "./seed";

/**
 * D2 (gstack eng review): teams are schema-only — the `lead` role has NO write
 * privileges at beta. Writing to / creating a team space requires owner/admin.
 * This locks in the rule that migration 0007 enforces (before it, a team lead
 * could write a team space).
 */

let db: Db;
let A: SeededOrg;

const one = <T>(r: { rows: unknown[] }) => r.rows[0] as T;

beforeAll(async () => {
  db = await freshDb();
  A = await seedOrg(db, "teams");
  // Make the plain member a LEAD of the team (role stays 'member').
  await asAdmin(db, "insert into team_members (team_id, user_id, is_lead) values ($1,$2,true)", [
    A.teamId,
    A.member.id,
  ]);
});

describe("teams schema-only: lead has no write privilege", () => {
  test("a team lead (role=member) CANNOT create a node in the team space", async () => {
    await expect(
      asUser(db, A.member.id, async (q) => {
        await q("select create_node($1,'fact','lead-write','x')", [A.teamSpaceId]);
      }),
    ).rejects.toThrow();
  });

  test("a team lead (role=member) CANNOT create a team space", async () => {
    await expect(
      asUser(db, A.member.id, async (q) => {
        await q(
          "insert into spaces (org_id, kind, team_id, name) values ($1,'team',$2,'Sneaky Team Space')",
          [A.id, A.teamId],
        );
      }),
    ).rejects.toThrow();
  });

  test("an owner/admin CAN still write the team space", async () => {
    const node = await asUser(db, A.owner.id, async (q) =>
      one<{ title: string }>(
        await q("select title from create_node($1,'fact','admin-write','ok')", [A.teamSpaceId]),
      ),
    );
    expect(node.title).toBe("admin-write");
  });

  test("a team lead can still READ the team space (reads are unchanged)", async () => {
    const seen = await asUser(db, A.member.id, async (q) =>
      one<{ n: number }>(await q("select count(*)::int n from nodes where id=$1", [A.teamNodeId])),
    );
    expect(seen.n).toBe(1);
  });
});
