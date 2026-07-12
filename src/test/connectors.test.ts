import { beforeEach, describe, expect, test } from "vitest";
import { asAdmin, asUser, freshDb, type Db } from "./db";
import { seedOrg, type SeededOrg } from "./seed";

let db: Db;
let A: SeededOrg;

const one = <T>(r: { rows: unknown[] }) => r.rows[0] as T;

beforeEach(async () => {
  db = await freshDb();
  A = await seedOrg(db, "connectors");
});

describe("connections RLS", () => {
  test("owner manages; a member can view but not create", async () => {
    const id = await asUser(db, A.owner.id, async (q) =>
      one<{ id: string }>(
        await q("insert into connections (org_id, provider) values ($1,'slack') returning id", [A.id]),
      ).id,
    );
    expect(id).toBeTruthy();

    const memberSees = await asUser(db, A.member.id, async (q) =>
      one<{ n: number }>(await q("select count(*)::int n from connections where org_id=$1", [A.id])),
    );
    expect(memberSees.n).toBe(1);

    await expect(
      asUser(db, A.member.id, async (q) => {
        await q("insert into connections (org_id, provider) values ($1,'gmail')", [A.id]);
      }),
    ).rejects.toThrow();
  });

  test("OAuth secrets are unreadable by any authenticated user — only the service role", async () => {
    const id = await asUser(db, A.owner.id, async (q) =>
      one<{ id: string }>(
        await q("insert into connections (org_id, provider) values ($1,'slack') returning id", [A.id]),
      ).id,
    );
    // Seed a token as the privileged role (as the sync job would).
    await asAdmin(db, "insert into connection_secrets (connection_id, secrets) values ($1, $2::jsonb)", [
      id,
      JSON.stringify({ token: "xoxb-super-secret" }),
    ]);

    // Even the owner, through the normal (authenticated) client, cannot read it.
    await expect(
      asUser(db, A.owner.id, async (q) => {
        await q("select secrets from connection_secrets where connection_id=$1", [id]);
      }),
    ).rejects.toThrow();
  });

  test("another org cannot see this org's connections", async () => {
    await asUser(db, A.owner.id, async (q) => {
      await q("insert into connections (org_id, provider) values ($1,'slack')", [A.id]);
    });
    const B = await seedOrg(db, "connectors-other");
    const n = await asUser(db, B.owner.id, async (q) =>
      one<{ n: number }>(await q("select count(*)::int n from connections where org_id=$1", [A.id])),
    );
    expect(n.n).toBe(0);
  });
});

describe("ingested_sources dedup", () => {
  test("the same external item can't be recorded twice for an org", async () => {
    await asAdmin(db, "insert into ingested_sources (org_id, provider, external_id) values ($1,'slack','msg-1')", [
      A.id,
    ]);
    await expect(
      asAdmin(db, "insert into ingested_sources (org_id, provider, external_id) values ($1,'slack','msg-1')", [A.id]),
    ).rejects.toThrow();

    // A different provider or external_id is fine.
    await asAdmin(db, "insert into ingested_sources (org_id, provider, external_id) values ($1,'gmail','msg-1')", [
      A.id,
    ]);
  });
});
