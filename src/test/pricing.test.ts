import { describe, expect, test } from "vitest";
import { costUsd, priceFor } from "@/lib/usage/pricing";
import { overCostCap, totalCost, type UsageRow } from "@/lib/usage/meter";

describe("pricing", () => {
  test("prices a known Anthropic model", () => {
    // Opus 4.8: $5/Mtok in, $25/Mtok out.
    expect(costUsd("claude-opus-4-8", 1_000_000, 1_000_000)).toBeCloseTo(30, 6);
  });

  test("prices Kimi and GLM (placeholder rates)", () => {
    expect(priceFor("kimi-k2-0711-preview")).not.toBeNull();
    expect(priceFor("glm-4.6")).not.toBeNull();
  });

  test("falls back to the model-family prefix for unknown dated variants", () => {
    // A hypothetical future snapshot still prices at the Opus rate.
    expect(costUsd("claude-opus-4-8-20260901", 1_000_000, 0)).toBeCloseTo(5, 6);
  });

  test("returns null for a genuinely unknown model", () => {
    expect(priceFor("mystery-model-1")).toBeNull();
    expect(costUsd("mystery-model-1", 1000, 1000)).toBeNull();
  });
});

describe("cost cap", () => {
  const row = (cost: number): UsageRow => ({
    kind: "ask",
    provider: "anthropic",
    model: "m",
    calls: 1,
    input_tokens: 0,
    output_tokens: 0,
    cost_usd: cost,
  });

  test("totalCost sums cost across rows", () => {
    expect(totalCost([row(1.5), row(2.25)])).toBeCloseTo(3.75, 6);
  });

  test("overCostCap is off when no cap is set (cap = 0)", () => {
    expect(overCostCap(9999, 0)).toBe(false);
  });

  test("overCostCap trips at or above the cap", () => {
    expect(overCostCap(9.99, 10)).toBe(false);
    expect(overCostCap(10, 10)).toBe(true);
  });
});
