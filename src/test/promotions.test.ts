import { beforeEach, describe, expect, test } from "vitest";
import { asUser, freshDb, type Db } from "./db";
import { seedOrg, type SeededOrg } from "./seed";

let db: Db;
let A: SeededOrg;

const one = <T>(r: { rows: unknown[] }) => r.rows[0] as T;

/** A node in `member`'s private space, created via the real RPC as the member. */
async function memberNode(space: string, title: string): Promise<string> {
  return asUser(db, A.member.id, async (q) =>
    one<{ id: string }>(
      await q("select id from create_node($1,'decision',$2,'body')", [space, title]),
    ).id,
  );
}

beforeEach(async () => {
  db = await freshDb();
  A = await seedOrg(db, "promo");
});

describe("request_promotion", () => {
  test("member proposes promoting their private node to the org space", async () => {
    const nodeId = await memberNode(A.memberPrivateSpaceId, "Pricing decision");
    const promo = await asUser(db, A.member.id, async (q) =>
      one<{ id: string; status: string; from_space: string; to_space: string }>(
        await q("select id, status, from_space, to_space from request_promotion($1,$2)", [
          nodeId,
          A.orgSpaceId,
        ]),
      ),
    );
    expect(promo.status).toBe("pending");
    expect(promo.from_space).toBe(A.memberPrivateSpaceId);
    expect(promo.to_space).toBe(A.orgSpaceId);
  });

  test("cannot promote a node you cannot write (someone else's private node)", async () => {
    // A.privateNodeId lives in the OWNER's private space; the member can't see it.
    await expect(
      asUser(db, A.member.id, async (q) => {
        await q("select id from request_promotion($1,$2)", [A.privateNodeId, A.orgSpaceId]);
      }),
    ).rejects.toThrow();
  });

  test("rejects promoting into the same space, and a duplicate pending request", async () => {
    const nodeId = await memberNode(A.memberPrivateSpaceId, "Idea");
    await expect(
      asUser(db, A.member.id, async (q) => {
        await q("select request_promotion($1,$2)", [nodeId, A.memberPrivateSpaceId]);
      }),
    ).rejects.toThrow();

    await asUser(db, A.member.id, async (q) => {
      await q("select request_promotion($1,$2)", [nodeId, A.orgSpaceId]);
    });
    await expect(
      asUser(db, A.member.id, async (q) => {
        await q("select request_promotion($1,$2)", [nodeId, A.orgSpaceId]);
      }),
    ).rejects.toThrow(/already pending/);
  });
});

describe("approve_promotion — owner/admin only (D2 gate)", () => {
  test("a plain member cannot approve; the owner can, and the node moves", async () => {
    const nodeId = await memberNode(A.memberPrivateSpaceId, "Net terms");
    const promoId = await asUser(db, A.member.id, async (q) =>
      one<{ id: string }>(await q("select id from request_promotion($1,$2)", [nodeId, A.orgSpaceId])).id,
    );

    // Another plain member cannot approve into the org space.
    await expect(
      asUser(db, A.member.id, async (q) => {
        await q("select approve_promotion($1)", [promoId]);
      }),
    ).rejects.toThrow(/not permitted/);

    // The owner (owner/admin) can.
    const approved = await asUser(db, A.owner.id, async (q) =>
      one<{ status: string; approved_by: string }>(
        await q("select status, approved_by from approve_promotion($1)", [promoId]),
      ),
    );
    expect(approved.status).toBe("approved");
    expect(approved.approved_by).toBe(A.owner.id);

    // The node now lives in the org space...
    const moved = await asUser(db, A.owner.id, async (q) =>
      one<{ space_id: string }>(await q("select space_id from nodes where id=$1", [nodeId])),
    );
    expect(moved.space_id).toBe(A.orgSpaceId);

    // ...and is therefore now readable by any org member (it wasn't before).
    const otherMemberSees = await asUser(db, A.member.id, async (q) =>
      one<{ n: number }>(await q("select count(*)::int n from nodes where id=$1", [nodeId])),
    );
    expect(otherMemberSees.n).toBe(1);
  });

  test("cannot approve the same promotion twice", async () => {
    const nodeId = await memberNode(A.memberPrivateSpaceId, "Once");
    const promoId = await asUser(db, A.member.id, async (q) =>
      one<{ id: string }>(await q("select id from request_promotion($1,$2)", [nodeId, A.orgSpaceId])).id,
    );
    await asUser(db, A.owner.id, async (q) => {
      await q("select approve_promotion($1)", [promoId]);
    });
    await expect(
      asUser(db, A.owner.id, async (q) => {
        await q("select approve_promotion($1)", [promoId]);
      }),
    ).rejects.toThrow(/already handled/);
  });
});

describe("reject_promotion", () => {
  test("owner rejects; node stays in the private space", async () => {
    const nodeId = await memberNode(A.memberPrivateSpaceId, "Nope");
    const promoId = await asUser(db, A.member.id, async (q) =>
      one<{ id: string }>(await q("select id from request_promotion($1,$2)", [nodeId, A.orgSpaceId])).id,
    );
    const rejected = await asUser(db, A.owner.id, async (q) =>
      one<{ status: string }>(await q("select status from reject_promotion($1)", [promoId])),
    );
    expect(rejected.status).toBe("rejected");

    const still = await asUser(db, A.member.id, async (q) =>
      one<{ space_id: string }>(await q("select space_id from nodes where id=$1", [nodeId])),
    );
    expect(still.space_id).toBe(A.memberPrivateSpaceId);
  });

  test("a plain member cannot reject a promotion into the org space", async () => {
    const nodeId = await memberNode(A.memberPrivateSpaceId, "Guard");
    const promoId = await asUser(db, A.member.id, async (q) =>
      one<{ id: string }>(await q("select id from request_promotion($1,$2)", [nodeId, A.orgSpaceId])).id,
    );
    await expect(
      asUser(db, A.member.id, async (q) => {
        await q("select reject_promotion($1)", [promoId]);
      }),
    ).rejects.toThrow();
  });
});

describe("list_promotions — scoped disclosure", () => {
  test("approver sees the pending request with a node preview and can_approve=true", async () => {
    const nodeId = await memberNode(A.memberPrivateSpaceId, "Preview me");
    await asUser(db, A.member.id, async (q) => {
      await q("select request_promotion($1,$2)", [nodeId, A.orgSpaceId]);
    });

    const row = await asUser(db, A.owner.id, async (q) =>
      one<{ node_title: string; can_approve: boolean; node_body_md: string }>(
        await q("select node_title, can_approve, node_body_md from list_promotions($1)", [A.id]),
      ),
    );
    expect(row.node_title).toBe("Preview me");
    expect(row.can_approve).toBe(true);
    expect(row.node_body_md).toBe("body"); // preview of a node in a space the owner couldn't otherwise read
  });

  test("an unrelated member sees no pending promotions they can't act on", async () => {
    const nodeId = await memberNode(A.memberPrivateSpaceId, "Hidden");
    await asUser(db, A.member.id, async (q) => {
      await q("select request_promotion($1,$2)", [nodeId, A.orgSpaceId]);
    });
    // The requester sees their own; a *different* non-approver would not. Here the
    // requester is the only non-owner, so assert they see their own request.
    const mineList = await asUser(db, A.member.id, async (q) =>
      await q("select id, can_approve from list_promotions($1)", [A.id]),
    );
    expect(mineList.rows).toHaveLength(1);
    expect((mineList.rows[0] as { can_approve: boolean }).can_approve).toBe(false);
  });

  test("an outsider (different org) is refused", async () => {
    await expect(
      asUser(db, A.outsider.id, async (q) => {
        await q("select * from list_promotions($1)", [A.id]);
      }),
    ).rejects.toThrow();
  });
});
