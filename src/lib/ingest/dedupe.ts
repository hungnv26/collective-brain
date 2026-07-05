import { cosine } from "@/lib/ai/embed";

export interface ExistingEmbedding {
  node_id: string;
  title: string;
  embedding: number[];
}

export interface DupCandidate {
  node_id: string;
  title: string;
  score: number;
}

/**
 * Flag existing nodes whose embedding is similar enough to a proposed node's
 * embedding to be a likely duplicate. Returns the top matches above threshold.
 */
export function findDuplicates(
  embedding: number[],
  existing: ExistingEmbedding[],
  threshold = 0.82,
  limit = 3,
): DupCandidate[] {
  return existing
    .map((e) => ({ node_id: e.node_id, title: e.title, score: cosine(embedding, e.embedding) }))
    .filter((c) => c.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
