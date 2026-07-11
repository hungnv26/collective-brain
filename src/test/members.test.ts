import { beforeEach, describe, expect, test } from "vitest";
import { asUser, freshDb, type Db } from "./db";
import { seedOrg, type SeededOrg } from "./seed";

let db: Db;
let A: SeededOrg;

const one = <T>(r: { rows: unknown[] }) => r.rows[0] as T;

beforeEach(async () => {
  db = await freshDb();
  A = await seedOrg(db, "members");
});

describe("inviting is owner/admin only", () => {
  test("owner creates an invite and can see it; a member cannot create one", async () => {
    const token = await asUser(db, A.owner.id, async (q) =>
      one<{ token: string }>(
        await q("select token from create_invite($1,$2,'member')", [A.id, "new@x.test"]),
      ).token,
    );
    expect(token).toHaveLength(36); // 18 random bytes, hex

    // The seed adds the member via its own (now-accepted) invite, so assert on
    // the pending count the way the UI lists it.
    const ownerSees = await asUser(db, A.owner.id, async (q) =>
      one<{ n: number }>(
        await q("select count(*)::int n from invites where org_id=$1 and status='pending'", [A.id]),
      ),
    );
    expect(ownerSees.n).toBe(1);

    await expect(
      asUser(db, A.member.id, async (q) => {
        await q("select create_invite($1,$2,'member')", [A.id, "sneak@x.test"]);
      }),
    ).rejects.toThrow(/insufficient privileges/);
  });

  test("a plain member cannot see pending invites (invites are admin-only)", async () => {
    await asUser(db, A.owner.id, async (q) => {
      await q("select create_invite($1,$2,'member')", [A.id, "hidden@x.test"]);
    });
    const memberSees = await asUser(db, A.member.id, async (q) =>
      one<{ n: number }>(await q("select count(*)::int n from invites where org_id=$1", [A.id])),
    );
    expect(memberSees.n).toBe(0);
  });
});

describe("accepting an invite adds the user to the org", () => {
  test("a non-member redeems the token and becomes a member", async () => {
    const token = await asUser(db, A.owner.id, async (q) =>
      one<{ token: string }>(
        await q("select token from create_invite($1,$2,'member')", [A.id, A.outsider.email]),
      ).token,
    );

    // Before: the outsider is not a member and sees nothing of the org.
    const before = await asUser(db, A.outsider.id, async (q) =>
      one<{ n: number }>(await q("select count(*)::int n from memberships where org_id=$1", [A.id])),
    );
    expect(before.n).toBe(0);

    await asUser(db, A.outsider.id, async (q) => {
      await q("select ensure_self($1)", [A.outsider.email]);
      await q("select accept_invite($1)", [token]);
    });

    // After: they're a member and can read the roster; the invite is consumed.
    const after = await asUser(db, A.outsider.id, async (q) =>
      one<{ n: number }>(await q("select count(*)::int n from memberships where org_id=$1", [A.id])),
    );
    expect(after.n).toBeGreaterThanOrEqual(3); // owner + member + outsider

    const inviteStatus = await asUser(db, A.owner.id, async (q) =>
      one<{ status: string }>(
        await q("select status from invites where org_id=$1 and email=$2", [A.id, A.outsider.email]),
      ),
    );
    expect(inviteStatus.status).toBe("accepted");
  });

  test("a stale token cannot be redeemed twice", async () => {
    const token = await asUser(db, A.owner.id, async (q) =>
      one<{ token: string }>(
        await q("select token from create_invite($1,$2,'member')", [A.id, A.outsider.email]),
      ).token,
    );
    await asUser(db, A.outsider.id, async (q) => {
      await q("select ensure_self($1)", [A.outsider.email]);
      await q("select accept_invite($1)", [token]);
    });
    await expect(
      asUser(db, A.outsider.id, async (q) => {
        await q("select accept_invite($1)", [token]);
      }),
    ).rejects.toThrow(/invalid or expired/);
  });
});

describe("member roster", () => {
  test("any member can read the roster", async () => {
    const roster = await asUser(db, A.member.id, async (q) =>
      one<{ n: number }>(await q("select count(*)::int n from memberships where org_id=$1", [A.id])),
    );
    expect(roster.n).toBeGreaterThanOrEqual(2); // owner + member
  });

  test("resolving your own role must scope by user_id, not just org", async () => {
    // memberships_select returns EVERY member's row, so an org-only query yields
    // multiple rows — that's what made getMembership's maybeSingle() collapse to
    // null and treat an owner as a plain member. Scoping by user_id fixes it.
    const orgOnly = await asUser(db, A.owner.id, async (q) =>
      one<{ n: number }>(await q("select count(*)::int n from memberships where org_id=$1", [A.id])),
    );
    expect(orgOnly.n).toBeGreaterThan(1); // ambiguous for maybeSingle()

    const mine = await asUser(db, A.owner.id, async (q) =>
      one<{ role: string }>(
        await q("select role from memberships where org_id=$1 and user_id=auth.uid()", [A.id]),
      ),
    );
    expect(mine.role).toBe("owner");
  });
});
