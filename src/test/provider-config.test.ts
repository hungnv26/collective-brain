import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { PROVIDER_IDS, getProvider, providerLabel, resolveLlmConfig } from "@/lib/ai/provider";

// Snapshot + restore the env vars this suite mutates.
const KEYS = [
  "CB_LLM_PROVIDER",
  "CB_DISTILL_MODEL",
  "CB_ANSWER_MODEL",
  "CB_KIMI_MODEL",
  "CB_KIMI_DISTILL_MODEL",
  "ANTHROPIC_API_KEY",
  "MOONSHOT_API_KEY",
] as const;
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  KEYS.forEach((k) => delete process.env[k]);
});
afterEach(() => {
  KEYS.forEach((k) => {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k]!;
  });
});

describe("resolveLlmConfig", () => {
  test("defaults to Anthropic + Opus with no env", () => {
    expect(resolveLlmConfig()).toEqual({
      provider: "anthropic",
      distillModel: "claude-opus-4-8",
      answerModel: "claude-opus-4-8",
    });
  });

  test("honours legacy CB_DISTILL_MODEL / CB_ANSWER_MODEL for Anthropic", () => {
    process.env.CB_DISTILL_MODEL = "claude-haiku-4-5-20251001";
    process.env.CB_ANSWER_MODEL = "claude-sonnet-5";
    const cfg = resolveLlmConfig();
    expect(cfg.distillModel).toBe("claude-haiku-4-5-20251001");
    expect(cfg.answerModel).toBe("claude-sonnet-5");
  });

  test("CB_LLM_PROVIDER=kimi selects Kimi defaults", () => {
    process.env.CB_LLM_PROVIDER = "kimi";
    process.env.CB_KIMI_MODEL = "kimi-k2-0711-preview";
    const cfg = resolveLlmConfig();
    expect(cfg.provider).toBe("kimi");
    expect(cfg.distillModel).toBe("kimi-k2-0711-preview");
    expect(cfg.answerModel).toBe("kimi-k2-0711-preview");
  });

  test("per-purpose Kimi override wins over the shared CB_KIMI_MODEL", () => {
    process.env.CB_LLM_PROVIDER = "kimi";
    process.env.CB_KIMI_MODEL = "kimi-k2-0711-preview";
    process.env.CB_KIMI_DISTILL_MODEL = "moonshot-v1-128k";
    const cfg = resolveLlmConfig();
    expect(cfg.distillModel).toBe("moonshot-v1-128k");
    expect(cfg.answerModel).toBe("kimi-k2-0711-preview");
  });

  test("per-org override beats the env default", () => {
    process.env.CB_LLM_PROVIDER = "anthropic";
    const cfg = resolveLlmConfig({ provider: "kimi", answerModel: "kimi-custom" });
    expect(cfg.provider).toBe("kimi");
    expect(cfg.answerModel).toBe("kimi-custom");
  });

  test("null/empty override fields fall through to env/defaults", () => {
    const cfg = resolveLlmConfig({ provider: null, distillModel: null, answerModel: undefined });
    expect(cfg.provider).toBe("anthropic");
    expect(cfg.distillModel).toBe("claude-opus-4-8");
  });

  test("an unknown CB_LLM_PROVIDER value falls back to anthropic", () => {
    process.env.CB_LLM_PROVIDER = "bogus";
    expect(resolveLlmConfig().provider).toBe("anthropic");
  });
});

describe("provider registry", () => {
  test("exposes all three providers", () => {
    expect(PROVIDER_IDS).toEqual(["anthropic", "kimi", "glm"]);
  });

  test("isConfigured reflects the provider's API key env", () => {
    delete process.env.MOONSHOT_API_KEY;
    expect(getProvider("kimi").isConfigured()).toBe(false);
    process.env.MOONSHOT_API_KEY = "sk-test";
    expect(getProvider("kimi").isConfigured()).toBe(true);
  });

  test("labels are human-readable", () => {
    expect(providerLabel("kimi")).toMatch(/Moonshot/);
    expect(providerLabel("glm")).toMatch(/Zhipu/);
  });
});
