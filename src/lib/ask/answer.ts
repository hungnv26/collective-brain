import type { Source } from "@/lib/retrieval/retrieve";
import { getProvider, resolveLlmConfig, type OrgLlmOverride, type StreamHandle } from "@/lib/ai/provider";

export const ANSWER_SYSTEM = `You answer questions about a company using ONLY the numbered sources provided. Rules:
- Ground every claim in the sources and cite them inline with [n] (e.g. "We priced onboarding at $8,000 [2]."). Cite the specific source(s) each statement comes from.
- If the sources do not contain the answer, say plainly that it isn't in the brain yet and do not guess or use outside knowledge.
- Be concise and direct. Do not restate the question or add filler.`;

/** Is the configured answering provider ready (has an API key)? */
export function isAnswererConfigured(override?: OrgLlmOverride | null): boolean {
  return getProvider(resolveLlmConfig(override).provider).isConfigured();
}

/** Which sources were actually cited (their [n] appears in the answer). */
export function citedSources(answer: string, sources: Source[]) {
  return sources.filter((s) => new RegExp(`\\[${s.n}\\]`).test(answer));
}

/** Build the streaming answer request. The route pipes deltas to the client as SSE. */
export function answerStream(question: string, context: string, override?: OrgLlmOverride | null): StreamHandle {
  const cfg = resolveLlmConfig(override);
  const user = context
    ? `Sources:\n\n${context}\n\nQuestion: ${question}`
    : `There are no sources available.\n\nQuestion: ${question}`;
  return getProvider(cfg.provider).stream({
    model: cfg.answerModel,
    system: ANSWER_SYSTEM,
    userText: user,
    maxTokens: 2000,
  });
}
