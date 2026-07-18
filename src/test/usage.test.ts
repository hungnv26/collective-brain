import { beforeEach, describe, expect, test } from "vitest";
import { asUser, freshDb, type Db } from "./db";
import { seedOrg, type SeededOrg } from "./seed";
import { monthStart, overCap, totalTokens, type UsageRow } from "@/lib/usage/meter";

let db: Db;
let A: SeededOrg;

const one = <T>(r: { rows: unknown[] }) => r.rows[0] as T;

async function logUsage(user: string, org: string, kind: string, inTok: number, outTok: number) {
  await asUser(db, user, async (q) => {
    await q(
      "insert into usage_events (org_id, user_id, kind, model, input_tokens, output_tokens) values ($1, auth.uid(), $2, 'claude-opus-4-8', $3, $4)",
      [org, kind, inTok, outTok],
    );
  });
}

describe("pure metering helpers", () => {
  test("overCap triggers at the cap", () => {
    expect(overCap(999, 1000)).toBe(false);
    expect(overCap(1000, 1000)).toBe(true);
    expect(overCap(1001, 1000)).toBe(true);
  });

  test("totalTokens sums input + output across rows", () => {
    const rows: UsageRow[] = [
      { kind: "ask", provider: "anthropic", model: "m", calls: 2, input_tokens: 100, output_tokens: 50, cost_usd: 0 },
      { kind: "distill", provider: "anthropic", model: "m", calls: 1, input_tokens: 300, output_tokens: 200, cost_usd: 0 },
    ];
    expect(totalTokens(rows)).toBe(650);
  });

  test("monthStart is the first of the current UTC month at 00:00", () => {
    const s = new Date(monthStart(new Date("2026-07-11T13:00:00Z")));
    expect(s.toISOString()).toBe("2026-07-01T00:00:00.000Z");
  });
});

describe("usage_events RLS + summary", () => {
  beforeEach(async () => {
    db = await freshDb();
    A = await seedOrg(db, "usage");
  });

  test("an org member records and reads their org's usage", async () => {
    await logUsage(A.member.id, A.id, "ask", 120, 80);
    await logUsage(A.owner.id, A.id, "distill", 1000, 500);

    const seen = await asUser(db, A.member.id, async (q) =>
      one<{ n: number }>(await q("select count(*)::int n from usage_events where org_id=$1", [A.id])),
    );
    expect(seen.n).toBe(2);
  });

  test("another org cannot see this org's usage", async () => {
    await logUsage(A.member.id, A.id, "ask", 120, 80);
    const B = await seedOrg(db, "usage-other");
    const outsiderSees = await asUser(db, B.owner.id, async (q) =>
      one<{ n: number }>(await q("select count(*)::int n from usage_events where org_id=$1", [A.id])),
    );
    expect(outsiderSees.n).toBe(0);
  });

  test("usage_summary rolls up by kind with token totals", async () => {
    await logUsage(A.member.id, A.id, "ask", 100, 40);
    await logUsage(A.member.id, A.id, "ask", 200, 60);
    await logUsage(A.owner.id, A.id, "distill", 500, 300);

    const rows = await asUser(db, A.owner.id, async (q) =>
      (
        await q("select kind, calls, input_tokens, output_tokens from usage_summary($1, $2) order by kind", [
          A.id,
          "1970-01-01T00:00:00Z",
        ])
      ).rows as { kind: string; calls: number; input_tokens: number; output_tokens: number }[],
    );

    const ask = rows.find((r) => r.kind === "ask")!;
    const distill = rows.find((r) => r.kind === "distill")!;
    expect(Number(ask.calls)).toBe(2);
    expect(Number(ask.input_tokens)).toBe(300);
    expect(Number(ask.output_tokens)).toBe(100);
    expect(Number(distill.input_tokens)).toBe(500);
  });

  test("summary is org-scoped — an outsider gets nothing", async () => {
    await logUsage(A.member.id, A.id, "ask", 100, 40);
    const B = await seedOrg(db, "usage-scope");
    const rows = await asUser(db, B.owner.id, async (q) =>
      (await q("select * from usage_summary($1, $2)", [A.id, "1970-01-01T00:00:00Z"])).rows,
    );
    expect(rows).toHaveLength(0);
  });
});
