import { beforeAll, describe, expect, test } from "vitest";
import { asUser, freshDb, type Db } from "./db";
import { seedOrg, type SeededOrg } from "./seed";

let db: Db;
let A: SeededOrg;

const rows = <T>(r: { rows: unknown[] }) => r.rows as T[];
const one = <T>(r: { rows: unknown[] }) => r.rows[0] as T;

beforeAll(async () => {
  db = await freshDb();
  A = await seedOrg(db, "n");
});

describe("create_node", () => {
  test("creates a node with an auto slug and a v1 version", async () => {
    const node = await asUser(db, A.owner.id, async (q) => {
      const r = await q("select * from create_node($1,'fact','Quarterly Revenue','We booked $2M in Q3.')", [
        A.orgSpaceId,
      ]);
      return one<{ id: string; slug: string; title: string }>(r);
    });
    expect(node.slug).toBe("quarterly-revenue");
    expect(node.title).toBe("Quarterly Revenue");

    const versions = await asUser(db, A.owner.id, async (q) =>
      rows<{ n: number }>(await q("select count(*)::int as n from node_versions where node_id=$1", [node.id])),
    );
    expect(versions[0].n).toBe(1);
  });

  test("dedupes slugs within a space", async () => {
    const slug = await asUser(db, A.owner.id, async (q) => {
      const r = await q("select slug from create_node($1,'fact','Quarterly Revenue','dup')", [A.orgSpaceId]);
      return one<{ slug: string }>(r).slug;
    });
    expect(slug).toBe("quarterly-revenue-2");
  });
});

describe("update_node", () => {
  test("updates fields and snapshots a new version", async () => {
    await asUser(db, A.owner.id, async (q) => {
      const created = one<{ id: string }>(
        await q("select id from create_node($1,'decision','Pricing','v1 body')", [A.orgSpaceId]),
      );
      await q("select update_node($1,'Pricing v2','v2 body',null,null,'reviewed')", [created.id]);

      const node = one<{ title: string; body_md: string; status: string }>(
        await q("select title, body_md, status from nodes where id=$1", [created.id]),
      );
      expect(node).toMatchObject({ title: "Pricing v2", body_md: "v2 body", status: "reviewed" });

      const vcount = one<{ n: number }>(
        await q("select count(*)::int as n from node_versions where node_id=$1", [created.id]),
      );
      expect(vcount.n).toBe(2); // v1 on create, v2 on update
    });
  });
});

describe("wikilinks & backlinks", () => {
  test("[[wikilink]] in the body creates a related link, visible as a backlink", async () => {
    await asUser(db, A.owner.id, async (q) => {
      const target = one<{ id: string; slug: string }>(
        await q("select id, slug from create_node($1,'fact','Onboarding SOP','how we onboard')", [A.orgSpaceId]),
      );
      const source = one<{ id: string }>(
        await q("select id from create_node($1,'fact','New Hire','See [[Onboarding SOP]] first.')", [A.orgSpaceId]),
      );

      const link = one<{ from_node: string; to_node: string; rel: string }>(
        await q("select from_node, to_node, rel from links where from_node=$1", [source.id]),
      );
      expect(link).toMatchObject({ from_node: source.id, to_node: target.id, rel: "related" });

      // backlink query (what the node view's right panel runs)
      const backlinks = rows<{ from_node: string }>(
        await q("select from_node from links where to_node=$1 and rel='related'", [target.id]),
      );
      expect(backlinks.map((b) => b.from_node)).toContain(source.id);
    });
  });

  test("editing out a wikilink removes the stale related link", async () => {
    await asUser(db, A.owner.id, async (q) => {
      one<{ id: string }>(await q("select id from create_node($1,'fact','Anchor','anchor')", [A.orgSpaceId]));
      const src = one<{ id: string }>(
        await q("select id from create_node($1,'fact','Refers','[[Anchor]] here')", [A.orgSpaceId]),
      );
      expect(one<{ n: number }>(await q("select count(*)::int n from links where from_node=$1", [src.id])).n).toBe(1);
      await q("select update_node($1,null,'no more link',null,null,null)", [src.id]);
      expect(one<{ n: number }>(await q("select count(*)::int n from links where from_node=$1", [src.id])).n).toBe(0);
    });
  });
});

describe("search_nodes", () => {
  test("finds nodes by title and body, RLS-scoped", async () => {
    const found = await asUser(db, A.owner.id, async (q) =>
      rows<{ title: string }>(await q("select title from search_nodes($1,'revenue')", [A.id])),
    );
    expect(found.some((n) => n.title === "Quarterly Revenue")).toBe(true);
  });
});

describe("RLS still governs node writes", () => {
  test("a plain member cannot create a node in the org space", async () => {
    await expect(
      asUser(db, A.member.id, async (q) => {
        await q("select create_node($1,'fact','sneaky','x')", [A.orgSpaceId]);
      }),
    ).rejects.toThrow();
  });

  test("a member CAN create a node in their own private space", async () => {
    const node = await asUser(db, A.member.id, async (q) =>
      one<{ id: string; title: string }>(
        await q("select id, title from create_node($1,'idea','My idea','mine')", [A.memberPrivateSpaceId]),
      ),
    );
    expect(node.title).toBe("My idea");
  });

  test("a member cannot read another user's private node via search", async () => {
    // owner's private node is invisible to member even by full-text search
    await asUser(db, A.owner.id, async (q) => {
      await q("select create_node($1,'fact','SecretPlan','confidential zebra')", [A.ownerPrivateSpaceId]);
    });
    const found = await asUser(db, A.member.id, async (q) =>
      rows<{ title: string }>(await q("select title from search_nodes($1,'zebra')", [A.id])),
    );
    expect(found.length).toBe(0);
  });
});
