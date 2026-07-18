import { AnthropicCompatProvider, type AnthropicCompatConfig } from "./anthropic-compat";
import type { LlmProvider, ProviderId } from "./types";

export type { LlmProvider, ProviderId, StreamHandle } from "./types";

/**
 * Static wiring per provider. Kimi (Moonshot) and GLM (Zhipu) both expose an
 * Anthropic-Messages-compatible endpoint, so all three share one adapter.
 * Base URLs are overridable via env for on-prem / regional endpoints
 * (e.g. Moonshot's .cn vs .ai, Zhipu's international host).
 */
const WIRING: Record<ProviderId, AnthropicCompatConfig> = {
  anthropic: {
    id: "anthropic",
    label: "Anthropic (Claude)",
    apiKeyEnv: "ANTHROPIC_API_KEY",
    // default endpoint (api.anthropic.com)
  },
  kimi: {
    id: "kimi",
    label: "Kimi (Moonshot)",
    apiKeyEnv: "MOONSHOT_API_KEY",
    baseURL: process.env.CB_KIMI_BASE_URL || "https://api.moonshot.ai/anthropic",
  },
  glm: {
    id: "glm",
    label: "GLM (Zhipu)",
    apiKeyEnv: "ZHIPU_API_KEY",
    baseURL: process.env.CB_GLM_BASE_URL || "https://open.bigmodel.cn/api/anthropic",
  },
};

export const PROVIDER_IDS = Object.keys(WIRING) as ProviderId[];

const instances = new Map<ProviderId, LlmProvider>();

/** Get the (memoised) provider adapter for an id. */
export function getProvider(id: ProviderId): LlmProvider {
  const existing = instances.get(id);
  if (existing) return existing;
  const p = new AnthropicCompatProvider(WIRING[id]);
  instances.set(id, p);
  return p;
}

export function providerLabel(id: ProviderId): string {
  return WIRING[id]?.label ?? id;
}

/** Resolved model choice for a request. */
export interface LlmConfig {
  provider: ProviderId;
  distillModel: string;
  answerModel: string;
}

/** Per-org override (Phase 2 persists this; any field may be omitted). */
export interface OrgLlmOverride {
  provider?: ProviderId | null;
  distillModel?: string | null;
  answerModel?: string | null;
}

function isProviderId(v: string | undefined): v is ProviderId {
  return !!v && (PROVIDER_IDS as string[]).includes(v);
}

/** Default models per provider, from env, with sensible fallbacks.
 *  Kimi/GLM model ids are env-overridable and should be verified against the
 *  provider's current model list. */
function defaultModels(provider: ProviderId): { distill: string; answer: string } {
  switch (provider) {
    case "kimi":
      return {
        distill: process.env.CB_KIMI_DISTILL_MODEL || process.env.CB_KIMI_MODEL || "kimi-k2-0711-preview",
        answer: process.env.CB_KIMI_ANSWER_MODEL || process.env.CB_KIMI_MODEL || "kimi-k2-0711-preview",
      };
    case "glm":
      return {
        distill: process.env.CB_GLM_DISTILL_MODEL || process.env.CB_GLM_MODEL || "glm-4.6",
        answer: process.env.CB_GLM_ANSWER_MODEL || process.env.CB_GLM_MODEL || "glm-4.6",
      };
    case "anthropic":
    default:
      // Preserve the legacy provider-agnostic env vars for Anthropic.
      return {
        distill: process.env.CB_DISTILL_MODEL || "claude-opus-4-8",
        answer: process.env.CB_ANSWER_MODEL || "claude-opus-4-8",
      };
  }
}

/**
 * Resolve the effective LLM config: per-org override wins over env default.
 * Phase 1 callers pass no override (env-only); Phase 2 passes the org's saved
 * settings.
 */
export function resolveLlmConfig(override?: OrgLlmOverride | null): LlmConfig {
  const envProvider = isProviderId(process.env.CB_LLM_PROVIDER) ? process.env.CB_LLM_PROVIDER : "anthropic";
  const provider = isProviderId(override?.provider ?? undefined) ? (override!.provider as ProviderId) : envProvider;
  const defaults = defaultModels(provider);
  return {
    provider,
    distillModel: override?.distillModel || defaults.distill,
    answerModel: override?.answerModel || defaults.answer,
  };
}
