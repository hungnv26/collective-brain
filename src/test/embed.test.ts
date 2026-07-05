import { describe, expect, test } from "vitest";
import { embed, cosine, EMBED_DIM, toPgVector, fromPgVector } from "@/lib/ai/embed";
import { findDuplicates } from "@/lib/ingest/dedupe";

describe("embed", () => {
  test("is deterministic and unit-length with the right dimension", () => {
    const a = embed("refund policy: 30 days");
    const b = embed("refund policy: 30 days");
    expect(a).toHaveLength(EMBED_DIM);
    expect(a).toEqual(b);
    const norm = Math.sqrt(a.reduce((s, x) => s + x * x, 0));
    expect(norm).toBeCloseTo(1, 5);
  });

  test("similar text scores higher than unrelated text", () => {
    const base = embed("The onboarding SOP covers laptop setup and account creation");
    const similar = embed("Onboarding procedure: set up the laptop and create accounts");
    const unrelated = embed("Quarterly revenue grew twenty percent in the Sydney region");
    expect(cosine(base, similar)).toBeGreaterThan(cosine(base, unrelated));
  });

  test("pgvector round-trips", () => {
    const v = embed("hello world");
    const parsed = fromPgVector(toPgVector(v));
    expect(parsed).toHaveLength(EMBED_DIM);
    expect(parsed[0]).toBeCloseTo(v[0], 5);
  });
});

describe("findDuplicates", () => {
  const existing = [
    { node_id: "n1", title: "Onboarding SOP", embedding: embed("Onboarding SOP: laptop setup and account creation") },
    { node_id: "n2", title: "Revenue", embedding: embed("Quarterly revenue grew in Sydney") },
  ];

  test("flags a near-identical proposed node", () => {
    const dup = findDuplicates(embed("Onboarding SOP: laptop setup and account creation"), existing, 0.8);
    expect(dup[0]?.node_id).toBe("n1");
    expect(dup[0]?.score).toBeGreaterThan(0.8);
  });

  test("returns nothing for a novel node", () => {
    const dup = findDuplicates(embed("Company holiday schedule for December"), existing, 0.82);
    expect(dup).toHaveLength(0);
  });
});
