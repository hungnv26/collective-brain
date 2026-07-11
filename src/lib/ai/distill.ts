import Anthropic from "@anthropic-ai/sdk";
import { NODE_TYPES } from "@/lib/types";
import type { TokenUsage } from "@/lib/usage/meter";

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

const PROPOSE_NODES_TOOL: Anthropic.Tool = {
  name: "propose_nodes",
  description: "Return the atomic knowledge nodes distilled from the source material.",
  // strict guarantees the input validates exactly against this schema.
  strict: true,
  input_schema: {
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
  },
};

export function isDistillerConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/** Distill raw text into proposed nodes via Claude (forced structured tool call). */
export async function distill(sourceText: string): Promise<DistillResult> {
  if (!isDistillerConfigured()) throw new Error("ANTHROPIC_API_KEY is not set");
  const client = new Anthropic();
  const model = process.env.CB_DISTILL_MODEL || "claude-opus-4-8";

  const res = await client.messages.create({
    model,
    max_tokens: 16000,
    system: SYSTEM,
    tools: [PROPOSE_NODES_TOOL],
    tool_choice: { type: "tool", name: "propose_nodes" },
    messages: [{ role: "user", content: `Source material:\n\n${sourceText}` }],
  });

  if (res.stop_reason === "refusal") {
    throw new Error("The model declined to process this source material.");
  }
  const block = res.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === "propose_nodes",
  );
  if (!block) throw new Error("Distiller returned no structured output.");
  const nodes = (block.input as { nodes?: ProposedNode[] }).nodes ?? [];
  return {
    nodes: nodes.filter((n) => n.title?.trim() && n.body_md !== undefined),
    usage: {
      model,
      inputTokens: res.usage.input_tokens,
      outputTokens: res.usage.output_tokens,
    },
  };
}
