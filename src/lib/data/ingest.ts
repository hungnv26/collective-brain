import { createClient } from "@/lib/supabase/server";
import type { IngestJob, ReviewItem } from "@/lib/types";

/** Ingest jobs for an org, newest first (RLS-filtered to readable spaces). */
export async function listJobs(orgId: string): Promise<IngestJob[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("ingest_jobs")
    .select("*")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(20);
  return (data ?? []) as IngestJob[];
}

export async function getJob(id: string): Promise<IngestJob | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("ingest_jobs").select("*").eq("id", id).maybeSingle();
  return (data as IngestJob | null) ?? null;
}

/** Pending review items for a job (the queue). */
export async function listPendingReviewItems(jobId: string): Promise<ReviewItem[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("review_items")
    .select("id, job_id, space_id, proposed, dup_candidates, status, created_node")
    .eq("job_id", jobId)
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  return (data ?? []) as ReviewItem[];
}
