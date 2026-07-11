import { cosine } from "@/lib/ai/embed";

export type AgentName = "digest" | "stale" | "gap" | "dedupe";
export const AGENTS: AgentName[] = ["digest", "stale", "gap", "dedupe"];

export const AGENT_LABEL: Record<AgentName, string> = {
  digest: "Weekly digest",
  stale: "Stale scan",
  gap: "Knowledge gaps",
  dedupe: "Duplicate scan",
};

/** Count nodes by their `type` field — the shape the digest reports. */
export function countByType(rows: { type: string }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) out[r.type] = (out[r.type] ?? 0) + 1;
  return out;
}

export interface EmbeddedNode {
  id: string;
  title: string;
  embedding: number[];
}

export interface DuplicatePair {
  a: string;
  b: string;
  titleA: string;
  titleB: string;
  score: number;
}

/**
 * Pure pairwise near-duplicate detection: every unordered pair of nodes whose
 * embeddings are at least `threshold` cosine-similar, most similar first. Pure
 * so it's unit-testable; the agent just feeds it the org's embeddings.
 */
export function duplicatePairs(
  nodes: EmbeddedNode[],
  threshold = 0.9,
  limit = 25,
): DuplicatePair[] {
  const pairs: DuplicatePair[] = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const score = cosine(nodes[i].embedding, nodes[j].embedding);
      if (score >= threshold) {
        pairs.push({
          a: nodes[i].id,
          b: nodes[j].id,
          titleA: nodes[i].title,
          titleB: nodes[j].title,
          score,
        });
      }
    }
  }
  return pairs.sort((x, y) => y.score - x.score).slice(0, limit);
}
