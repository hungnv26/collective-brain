import { beforeAll, describe, expect, test } from "vitest";
import { asUser, freshDb, type Db } from "./db";
import { seedOrg, type SeededOrg } from "./seed";

let db: Db;
let A: SeededOrg;

const one = <T>(r: { rows: unknown[] }) => r.rows[0] as T;

beforeAll(async () => {
  db = await freshDb();
  A = await seedOrg(db, "ask");
});

describe("conversations & messages are private to the user", () => {
  test("owner creates a conversation with a message; member cannot see it", async () => {
    const convId = await asUser(db, A.owner.id, async (q) => {
      const c = one<{ id: string }>(
        await q("insert into conversations (org_id, user_id, title) values ($1, auth.uid(), 'Q1') returning id", [A.id]),
      );
      await q("insert into messages (conversation_id, org_id, role, content) values ($1,$2,'user','what did we decide?')", [c.id, A.id]);
      return c.id;
    });

    const ownerSees = await asUser(db, A.owner.id, async (q) =>
      one<{ n: number }>(await q("select count(*)::int n from messages where conversation_id=$1", [convId])),
    );
    expect(ownerSees.n).toBe(1);

    const memberSeesConv = await asUser(db, A.member.id, async (q) =>
      one<{ n: number }>(await q("select count(*)::int n from conversations where id=$1", [convId])),
    );
    expect(memberSeesConv.n).toBe(0);

    const memberSeesMsg = await asUser(db, A.member.id, async (q) =>
      one<{ n: number }>(await q("select count(*)::int n from messages where conversation_id=$1", [convId])),
    );
    expect(memberSeesMsg.n).toBe(0);
  });

  test("a user cannot post a message into someone else's conversation", async () => {
    const convId = await asUser(db, A.owner.id, async (q) =>
      one<{ id: string }>(
        await q("insert into conversations (org_id, user_id) values ($1, auth.uid()) returning id", [A.id]),
      ).id,
    );
    await expect(
      asUser(db, A.member.id, async (q) => {
        await q("insert into messages (conversation_id, org_id, role, content) values ($1,$2,'user','sneak')", [convId, A.id]);
      }),
    ).rejects.toThrow();
  });
});

describe("knowledge-gap log is org-visible", () => {
  test("a member logs a gap; another org member can see it", async () => {
    await asUser(db, A.member.id, async (q) => {
      await q("insert into questions_log (org_id, user_id, question, answered) values ($1, auth.uid(), 'where is the vpn config?', false)", [A.id]);
    });
    const ownerSees = await asUser(db, A.owner.id, async (q) =>
      one<{ n: number }>(await q("select count(*)::int n from questions_log where org_id=$1 and answered=false", [A.id])),
    );
    expect(ownerSees.n).toBeGreaterThanOrEqual(1);
  });

  test("an outsider (different org) cannot see the gap", async () => {
    const B = await seedOrg(db, "ask2");
    const outsiderSees = await asUser(db, B.owner.id, async (q) =>
      one<{ n: number }>(await q("select count(*)::int n from questions_log where org_id=$1", [A.id])),
    );
    expect(outsiderSees.n).toBe(0);
  });
});
