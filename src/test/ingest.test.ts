import { beforeEach, describe, expect, test } from "vitest";
import { asAdmin, asUser, freshDb, type Db } from "./db";
import { seedOrg, type SeededOrg } from "./seed";

let db: Db;
let A: SeededOrg;

const one = <T>(r: { rows: unknown[] }) => r.rows[0] as T;

async function seedReviewItem(spaceId: string, proposed: object) {
  const job = one<{ id: string }>(
    await asAdmin(
      db,
      "insert into ingest_jobs (org_id, space_id, source_kind, source_text, status) values ($1,$2,'paste',$3,'ready') returning id",
      [A.id, spaceId, "some transcript"],
    ),
  );
  return one<{ id: string }>(
    await asAdmin(
      db,
      "insert into review_items (job_id, org_id, space_id, proposed) values ($1,$2,$3,$4) returning id",
      [job.id, A.id, spaceId, JSON.stringify(proposed)],
    ),
  ).id;
}

beforeEach(async () => {
  db = await freshDb();
  A = await seedOrg(db, "i");
});

describe("accept_review_item", () => {
  test("owner accepts a proposed node → creates a reviewed node, marks item accepted", async () => {
    const itemId = await seedReviewItem(A.orgSpaceId, {
      title: "Refund Policy",
      type: "decision",
      body_md: "Refunds within 30 days.",
      confidence: "high",
    });

    const node = await asUser(db, A.owner.id, async (q) =>
      one<{ id: string; title: string; type: string; status: string }>(
        await q("select id, title, type, status from accept_review_item($1)", [itemId]),
      ),
    );
    expect(node).toMatchObject({ title: "Refund Policy", type: "decision", status: "reviewed" });

    const item = await asUser(db, A.owner.id, async (q) =>
      one<{ status: string; created_node: string }>(
        await q("select status, created_node from review_items where id=$1", [itemId]),
      ),
    );
    expect(item.status).toBe("accepted");
    expect(item.created_node).toBe(node.id);

    // and it created exactly one node with a v1 version
    const v = await asUser(db, A.owner.id, async (q) =>
      one<{ n: number }>(await q("select count(*)::int n from node_versions where node_id=$1", [node.id])),
    );
    expect(v.n).toBe(1);
  });

  test("edit-then-accept applies overrides and marks item edited", async () => {
    const itemId = await seedReviewItem(A.orgSpaceId, { title: "Draft", type: "fact", body_md: "x" });
    await asUser(db, A.owner.id, async (q) => {
      await q("select accept_review_item($1, $2)", [itemId, JSON.stringify({ title: "Corrected Title" })]);
    });
    const item = await asUser(db, A.owner.id, async (q) =>
      one<{ status: string }>(await q("select status from review_items where id=$1", [itemId])),
    );
    expect(item.status).toBe("edited");
    const node = await asUser(db, A.owner.id, async (q) =>
      one<{ title: string }>(await q("select n.title from nodes n join review_items r on r.created_node=n.id where r.id=$1", [itemId])),
    );
    expect(node.title).toBe("Corrected Title");
  });

  test("a proposed node cannot be accepted twice", async () => {
    const itemId = await seedReviewItem(A.orgSpaceId, { title: "Once", type: "fact", body_md: "y" });
    await asUser(db, A.owner.id, async (q) => q("select accept_review_item($1)", [itemId]));
    await expect(
      asUser(db, A.owner.id, async (q) => {
        await q("select accept_review_item($1)", [itemId]);
      }),
    ).rejects.toThrow(/already handled/);
  });
});

describe("RLS on the ingest pipeline", () => {
  test("a plain member cannot accept an item destined for the org space", async () => {
    const itemId = await seedReviewItem(A.orgSpaceId, { title: "Nope", type: "fact", body_md: "z" });
    await expect(
      asUser(db, A.member.id, async (q) => {
        await q("select accept_review_item($1)", [itemId]);
      }),
    ).rejects.toThrow();
  });

  test("a member cannot even see review items for a space they can't read", async () => {
    // item destined for the owner's PRIVATE space — invisible to the member
    const itemId = await seedReviewItem(A.ownerPrivateSpaceId, { title: "Secret", type: "fact", body_md: "s" });
    const visible = await asUser(db, A.member.id, async (q) =>
      one<{ n: number }>(await q("select count(*)::int n from review_items where id=$1", [itemId])),
    );
    expect(visible.n).toBe(0);
  });

  test("a member CAN accept an item into their own private space", async () => {
    const itemId = await seedReviewItem(A.memberPrivateSpaceId, { title: "Mine", type: "idea", body_md: "m" });
    const node = await asUser(db, A.member.id, async (q) =>
      one<{ title: string }>(await q("select title from accept_review_item($1)", [itemId])),
    );
    expect(node.title).toBe("Mine");
  });
});
