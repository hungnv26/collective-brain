// Per-model token pricing, USD per 1,000,000 tokens (input / output). Used to
// turn metered token counts into a comparable dollar cost across providers —
// a GLM token and an Opus token cost very different amounts, so tokens alone
// aren't a fair usage signal once you can switch providers.
//
// Anthropic prices are current as of 2026-06 (see the claude-api skill's model
// table). Kimi (Moonshot) and GLM (Zhipu) prices are PLACEHOLDERS — verify and
// update against each provider's current price sheet before trusting the $ figures.

export interface ModelPrice {
  /** USD per 1M input tokens. */
  inPerMtok: number;
  /** USD per 1M output tokens. */
  outPerMtok: number;
}

// Exact-id matches take precedence; PREFIX_PRICES is the fallback for unknown
// dated/snapshot variants (e.g. a future "claude-opus-4-8-YYYYMMDD").
const MODEL_PRICES: Record<string, ModelPrice> = {
  // Anthropic (USD/Mtok)
  "claude-opus-4-8": { inPerMtok: 5, outPerMtok: 25 },
  "claude-opus-4-7": { inPerMtok: 5, outPerMtok: 25 },
  "claude-opus-4-6": { inPerMtok: 5, outPerMtok: 25 },
  "claude-opus-4-5": { inPerMtok: 5, outPerMtok: 25 },
  "claude-sonnet-5": { inPerMtok: 3, outPerMtok: 15 }, // standard rate (intro $2/$10 through 2026-08-31)
  "claude-sonnet-4-6": { inPerMtok: 3, outPerMtok: 15 },
  "claude-haiku-4-5": { inPerMtok: 1, outPerMtok: 5 },
  "claude-fable-5": { inPerMtok: 10, outPerMtok: 50 },

  // Kimi / Moonshot — PLACEHOLDER, verify against platform.moonshot.ai pricing.
  "kimi-k2-0711-preview": { inPerMtok: 0.6, outPerMtok: 2.5 },

  // GLM / Zhipu — PLACEHOLDER, verify against open.bigmodel.cn pricing.
  "glm-4.6": { inPerMtok: 0.6, outPerMtok: 2.2 },
};

// Fallback by model-family prefix when the exact id isn't in the table.
const PREFIX_PRICES: [string, ModelPrice][] = [
  ["claude-opus", { inPerMtok: 5, outPerMtok: 25 }],
  ["claude-sonnet", { inPerMtok: 3, outPerMtok: 15 }],
  ["claude-haiku", { inPerMtok: 1, outPerMtok: 5 }],
  ["claude-fable", { inPerMtok: 10, outPerMtok: 50 }],
  ["kimi", { inPerMtok: 0.6, outPerMtok: 2.5 }],
  ["moonshot", { inPerMtok: 0.6, outPerMtok: 2.5 }],
  ["glm", { inPerMtok: 0.6, outPerMtok: 2.2 }],
];

/** Price for a model, or null if we don't have a rate for it. */
export function priceFor(model: string): ModelPrice | null {
  if (MODEL_PRICES[model]) return MODEL_PRICES[model];
  const m = model.toLowerCase();
  for (const [prefix, price] of PREFIX_PRICES) {
    if (m.startsWith(prefix)) return price;
  }
  return null;
}

/**
 * Cost in USD for a metered call, or null when the model has no known price
 * (so the UI can show "unpriced" rather than a misleading $0).
 */
export function costUsd(model: string, inputTokens: number, outputTokens: number): number | null {
  const p = priceFor(model);
  if (!p) return null;
  return (inputTokens / 1_000_000) * p.inPerMtok + (outputTokens / 1_000_000) * p.outPerMtok;
}
