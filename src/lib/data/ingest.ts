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

export interface ReviewGroup {
  job: IngestJob;
  items: ReviewItem[];
}

/**
 * Every pending review item across the org, grouped by ingest job — the
 * aggregate Review Queue. RLS scopes both reads to spaces the caller can read.
 */
export async function listPendingReviewsByOrg(orgId: string): Promise<ReviewGroup[]> {
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("review_items")
    .select("id, job_id, space_id, proposed, dup_candidates, status, created_node")
    .eq("org_id", orgId)
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  const items = (rows ?? []) as ReviewItem[];
  if (items.length === 0) return [];

  const jobIds = [...new Set(items.map((i) => i.job_id))];
  const { data: jobRows } = await supabase.from("ingest_jobs").select("*").in("id", jobIds);
  const jobById = new Map((jobRows ?? []).map((j) => [(j as IngestJob).id, j as IngestJob]));

  const groups: ReviewGroup[] = [];
  for (const id of jobIds) {
    const job = jobById.get(id);
    if (job) groups.push({ job, items: items.filter((i) => i.job_id === id) });
  }
  return groups;
}

/** Count of pending review items across the org (for the nav badge). */
export async function countPendingReviews(orgId: string): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("review_items")
    .select("*", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("status", "pending");
  return count ?? 0;
}
