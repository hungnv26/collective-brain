import Anthropic from "@anthropic-ai/sdk";
import type { Source } from "@/lib/retrieval/retrieve";

export const ANSWER_SYSTEM = `You answer questions about a company using ONLY the numbered sources provided. Rules:
- Ground every claim in the sources and cite them inline with [n] (e.g. "We priced onboarding at $8,000 [2]."). Cite the specific source(s) each statement comes from.
- If the sources do not contain the answer, say plainly that it isn't in the brain yet and do not guess or use outside knowledge.
- Be concise and direct. Do not restate the question or add filler.`;

export function isAnswererConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export function answerModel(): string {
  return process.env.CB_ANSWER_MODEL || "claude-opus-4-8";
}

/** Which sources were actually cited (their [n] appears in the answer). */
export function citedSources(answer: string, sources: Source[]) {
  return sources.filter((s) => new RegExp(`\\[${s.n}\\]`).test(answer));
}

/** Build the streaming request. The route pipes deltas to the client as SSE. */
export function answerStream(client: Anthropic, question: string, context: string) {
  const user = context
    ? `Sources:\n\n${context}\n\nQuestion: ${question}`
    : `There are no sources available.\n\nQuestion: ${question}`;
  return client.messages.stream({
    model: answerModel(),
    max_tokens: 2000,
    system: ANSWER_SYSTEM,
    messages: [{ role: "user", content: user }],
  });
}
