import type { SupabaseClient } from "@supabase/supabase-js";
import { distill } from "@/lib/ai/distill";
import { getOrgLlmOverride } from "@/lib/data/org-settings";
import { embed, fromPgVector } from "@/lib/ai/embed";
import { extractText, type SourceKind } from "./extract";
import { findDuplicates, type ExistingEmbedding } from "./dedupe";
import { monthToDateTokens, monthlyTokenCap, overCap, recordUsage } from "@/lib/usage/meter";
import { looksLikeWhatsAppExport, parseWhatsAppExport } from "@/lib/connectors/whatsapp";

export interface IngestParams {
  spaceId: string;
  sourceKind: SourceKind;
  text?: string;
  url?: string;
  filename?: string;
}

export interface IngestResult {
  jobId: string;
  proposed: number;
  dupes: number;
}

/**
 * Full ingest pipeline, run under the caller's session (RLS enforced): create a
 * job → extract text → Claude distills nodes → embed + dedupe each → write the
 * review queue. Embeddings for the real nodes are written later, on accept.
 */
export async function runIngest(
  supabase: SupabaseClient,
  params: IngestParams,
): Promise<IngestResult> {
  const { data: space } = await supabase
    .from("spaces")
    .select("org_id")
    .eq("id", params.spaceId)
    .maybeSingle();
  if (!space) throw new Error("Space not found or not permitted");
  const orgId = (space as { org_id: string }).org_id;

  const { data: job, error: jobErr } = await supabase
    .from("ingest_jobs")
    .insert({
      org_id: orgId,
      space_id: params.spaceId,
      source_kind: params.sourceKind,
      source_uri: params.url ?? params.filename ?? null,
      status: "extracting",
    })
    .select("id")
    .single();
  if (jobErr || !job) throw new Error(jobErr?.message ?? "Could not create ingest job");
  const jobId = (job as { id: string }).id;

  try {
    // Enforce the monthly token cap before spending on distillation.
    if (overCap(await monthToDateTokens(supabase, orgId))) {
      throw new Error(
        `Monthly usage cap reached (${monthlyTokenCap().toLocaleString()} tokens). Ingest paused until next month or a higher cap.`,
      );
    }

    const extracted = await extractText(params.sourceKind, params);
    // A WhatsApp chat export (no API for group chats) arrives as an uploaded
    // .txt — detect it and clean it to plain "Author: message" before distilling.
    const text = looksLikeWhatsAppExport(extracted.text)
      ? parseWhatsAppExport(extracted.text)
      : extracted.text;
    await supabase
      .from("ingest_jobs")
      .update({ status: "distilling", source_text: text.slice(0, 100_000) })
      .eq("id", jobId);

    const { nodes: proposed, usage } = await distill(text, await getOrgLlmOverride(supabase, orgId));
    await recordUsage(supabase, { orgId, kind: "distill", usage });

    // Existing node embeddings in this org, for dedupe.
    const { data: embRows } = await supabase
      .from("embeddings")
      .select("node_id, embedding, nodes(title)")
      .eq("org_id", orgId);
    const existing: ExistingEmbedding[] = (embRows ?? []).map((r) => {
      const row = r as { node_id: string; embedding: string | number[]; nodes: { title?: string } | { title?: string }[] | null };
      const title = Array.isArray(row.nodes) ? row.nodes[0]?.title : row.nodes?.title;
      return { node_id: row.node_id, title: title ?? "", embedding: fromPgVector(row.embedding) };
    });

    let dupes = 0;
    const items = proposed.map((p) => {
      const candidates = findDuplicates(embed(`${p.title}\n${p.body_md}`), existing);
      if (candidates.length) dupes++;
      return {
        job_id: jobId,
        org_id: orgId,
        space_id: params.spaceId,
        proposed: p,
        dup_candidates: candidates,
      };
    });

    if (items.length) {
      const { error: insErr } = await supabase.from("review_items").insert(items);
      if (insErr) throw new Error(insErr.message);
    }

    await supabase
      .from("ingest_jobs")
      .update({ status: "ready", stats: { proposed: proposed.length, dupes, chars: text.length } })
      .eq("id", jobId);

    return { jobId, proposed: proposed.length, dupes };
  } catch (err) {
    await supabase
      .from("ingest_jobs")
      .update({ status: "failed", error: err instanceof Error ? err.message : "failed" })
      .eq("id", jobId);
    throw err;
  }
}
