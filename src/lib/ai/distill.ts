import { NODE_TYPES } from "@/lib/types";
import type { TokenUsage } from "@/lib/usage/meter";
import { getProvider, resolveLlmConfig, type OrgLlmOverride } from "@/lib/ai/provider";

export interface ProposedNode {
  title: string;
  type: string;
  confidence: "low" | "medium" | "high";
  body_md: string;
}

export interface DistillResult {
  nodes: ProposedNode[];
  usage: TokenUsage;
}

// Kept in sync with prompts/distill.system.md.
const SYSTEM = `You distill raw source material (meeting transcripts, documents, emails, notes) into atomic knowledge nodes for a company's shared "second brain".

Rules:
- Produce atomic nodes: one fact, decision, procedure, or idea each. Split compound material into separate nodes rather than one long note.
- Give every node a short, specific title (what someone would search for).
- Choose the best type: fact, decision, sop, person, client, project, meeting, idea.
- Write a concise markdown body (2-6 sentences). Preserve concrete details: names, numbers, dates, amounts, owners.
- When a node clearly relates to another node you are proposing, reference it in the body with a [[Wikilink Title]] using that other node's exact title. Do not invent links to things not in the source.
- Set confidence: high if the source states it plainly, medium if implied, low if speculative.
- Extract only what is actually supported by the source. Do not pad or add commentary.

Return the nodes via the propose_nodes tool.`;

// JSON Schema for the propose_nodes tool input (the structured payload we want back).
const PROPOSE_NODES_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  properties: {
    nodes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string" },
          type: { type: "string", enum: [...NODE_TYPES] },
          confidence: { type: "string", enum: ["low", "medium", "high"] },
          body_md: { type: "string" },
        },
        required: ["title", "type", "confidence", "body_md"],
      },
    },
  },
  required: ["nodes"],
};

/** Is the configured distillation provider ready (has an API key)? */
export function isDistillerConfigured(override?: OrgLlmOverride | null): boolean {
  return getProvider(resolveLlmConfig(override).provider).isConfigured();
}

/** Distill raw text into proposed nodes via a forced structured tool call. */
export async function distill(sourceText: string, override?: OrgLlmOverride | null): Promise<DistillResult> {
  const cfg = resolveLlmConfig(override);
  const provider = getProvider(cfg.provider);
  if (!provider.isConfigured()) throw new Error(`${provider.label} is not configured (missing API key)`);

  const res = await provider.structured<{ nodes?: ProposedNode[] }>({
    model: cfg.distillModel,
    system: SYSTEM,
    toolName: "propose_nodes",
    toolDescription: "Return the atomic knowledge nodes distilled from the source material.",
    inputSchema: PROPOSE_NODES_SCHEMA,
    userText: `Source material:\n\n${sourceText}`,
    maxTokens: 16000,
  });

  if (res.refused) throw new Error("The model declined to process this source material.");
  if (!res.data) throw new Error("Distiller returned no structured output.");
  const nodes = res.data.nodes ?? [];
  return {
    nodes: nodes.filter((n) => n.title?.trim() && n.body_md !== undefined),
    usage: res.usage,
  };
}
