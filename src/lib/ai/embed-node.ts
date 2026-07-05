import type { SupabaseClient } from "@supabase/supabase-js";
import { embed, toPgVector } from "@/lib/ai/embed";
import type { Node } from "@/lib/types";

/** Compute and store an embedding for a node (chunk 0 = title + body). */
export async function storeNodeEmbedding(supabase: SupabaseClient, node: Node): Promise<void> {
  const content = `${node.title}\n${node.body_md}`;
  await supabase.from("embeddings").upsert(
    {
      node_id: node.id,
      org_id: node.org_id,
      chunk_ix: 0,
      content,
      embedding: toPgVector(embed(content)),
    },
    { onConflict: "node_id,chunk_ix" },
  );
}
