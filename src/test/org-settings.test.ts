import { beforeEach, describe, expect, test } from "vitest";
import { asUser, freshDb, type Db } from "./db";
import { seedOrg, type SeededOrg } from "./seed";

let db: Db;
let A: SeededOrg;
let B: SeededOrg;

beforeEach(async () => {
  db = await freshDb();
  A = await seedOrg(db, "a");
  B = await seedOrg(db, "b");
});

const upsert = (provider: string) =>
  `insert into org_settings (org_id, llm_provider) values ($1, $2)
   on conflict (org_id) do update set llm_provider = excluded.llm_provider`;

describe("org_settings RLS", () => {
  test("owner can set their org's provider", async () => {
    await asUser(db, A.owner.id, (q) => q(upsert("kimi"), [A.id, "kimi"]));
    const rows = await asUser(db, A.owner.id, (q) =>
      q("select llm_provider from org_settings where org_id=$1", [A.id]),
    );
    expect((rows.rows[0] as { llm_provider: string }).llm_provider).toBe("kimi");
  });

  test("a plain member cannot change settings but can read them", async () => {
    await asUser(db, A.owner.id, (q) => q(upsert("glm"), [A.id, "glm"]));

    // Member read is allowed (the app resolves the provider on every request).
    const read = await asUser(db, A.member.id, (q) =>
      q("select llm_provider from org_settings where org_id=$1", [A.id]),
    );
    expect((read.rows[0] as { llm_provider: string }).llm_provider).toBe("glm");

    // Member write is denied by RLS.
    await expect(
      asUser(db, A.member.id, (q) => q(upsert("kimi"), [A.id, "kimi"])),
    ).rejects.toThrow(/row-level security|policy/i);
  });

  test("an outsider cannot read or write another org's settings", async () => {
    await asUser(db, A.owner.id, (q) => q(upsert("kimi"), [A.id, "kimi"]));

    // B's owner is an outsider to org A: the row is invisible.
    const read = await asUser(db, B.owner.id, (q) =>
      q("select llm_provider from org_settings where org_id=$1", [A.id]),
    );
    expect(read.rows).toHaveLength(0);

    // And they cannot write settings for org A.
    await expect(
      asUser(db, B.owner.id, (q) => q(upsert("glm"), [A.id, "glm"])),
    ).rejects.toThrow(/row-level security|policy/i);
  });

  test("the provider check constraint rejects unknown providers", async () => {
    await expect(
      asUser(db, A.owner.id, (q) => q(upsert("bogus"), [A.id, "bogus"])),
    ).rejects.toThrow(/org_settings_provider_chk|constraint/i);
  });
});
