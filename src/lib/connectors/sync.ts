import type { SupabaseClient } from "@supabase/supabase-js";
import { CONNECTORS, type NormalizedItem, type Provider, type Secrets } from "./types";
import { distill, isDistillerConfigured } from "@/lib/ai/distill";
import { recordUsage } from "@/lib/usage/meter";

export interface Connection {
  id: string;
  org_id: string;
  provider: Provider;
  status: string;
  target_space_id: string | null;
  config: Record<string, unknown>;
  sync_cursor: string | null;
}

const MAX_ITEMS_PER_RUN = 200;

/**
 * Sync one connection: pull new items via its adapter, drop already-ingested
 * ones, distill the rest into review items, and advance the cursor. Runs under
 * the service-role client (no user session); the reviewed nodes only reach a
 * space when an org member accepts them, so RLS still governs the content.
 */
export async function syncConnection(
  supabase: SupabaseClient,
  conn: Connection,
): Promise<{ ingested: number; skipped: number }> {
  const connector = CONNECTORS[conn.provider];
  if (!connector) return { ingested: 0, skipped: 0 }; // no adapter registered yet

  const { data: secretRow } = await supabase
    .from("connection_secrets")
    .select("secrets")
    .eq("connection_id", conn.id)
    .maybeSingle();
  const secrets = (secretRow?.secrets ?? {}) as Secrets;

  let ingested = 0;
  let skipped = 0;
  let error: string | null = null;

  try {
    const { items, cursor } = await connector.fetchSince(secrets, conn.sync_cursor, conn.config);
    const batch = items.slice(0, MAX_ITEMS_PER_RUN);
    const fresh = await filterNew(supabase, conn, batch);
    skipped = batch.length - fresh.length;

    if (fresh.length > 0 && conn.target_space_id) {
      ingested = await ingestItems(supabase, conn, fresh);
    }

    await supabase
      .from("connections")
      .update({ sync_cursor: cursor, last_synced_at: new Date().toISOString(), last_error: null })
      .eq("id", conn.id);
  } catch (e) {
    error = e instanceof Error ? e.message : "sync failed";
    await supabase.from("connections").update({ status: "error", last_error: error }).eq("id", conn.id);
  }

  await supabase.from("sync_runs").insert({
    connection_id: conn.id,
    org_id: conn.org_id,
    status: error ? "error" : "ok",
    items: ingested,
    error,
  });

  return { ingested, skipped };
}

/** Drop items already recorded in ingested_sources for this org+provider. */
async function filterNew(
  supabase: SupabaseClient,
  conn: Connection,
  items: NormalizedItem[],
): Promise<NormalizedItem[]> {
  if (items.length === 0) return [];
  const ids = items.map((i) => i.externalId);
  const { data } = await supabase
    .from("ingested_sources")
    .select("external_id")
    .eq("org_id", conn.org_id)
    .eq("provider", conn.provider)
    .in("external_id", ids);
  const seen = new Set((data ?? []).map((r) => (r as { external_id: string }).external_id));
  return items.filter((i) => !seen.has(i.externalId));
}

/**
 * Turn fresh items into review items via the existing distill pipeline: one
 * ingest job per sync batch, Claude distills the combined text into proposed
 * nodes, each becomes a pending review item in the target space. Every source
 * item is recorded in ingested_sources so it's never re-ingested.
 */
async function ingestItems(
  supabase: SupabaseClient,
  conn: Connection,
  items: NormalizedItem[],
): Promise<number> {
  if (!isDistillerConfigured()) throw new Error("ANTHROPIC_API_KEY is not set");

  const text = items.map((i) => `${i.author ?? "unknown"} (${i.timestamp}): ${i.text}`).join("\n\n");

  const { data: job } = await supabase
    .from("ingest_jobs")
    .insert({
      org_id: conn.org_id,
      space_id: conn.target_space_id,
      source_kind: "url",
      source_uri: `${conn.provider}:sync`,
      source_text: text.slice(0, 100_000),
      status: "distilling",
    })
    .select("id")
    .single();
  if (!job) return 0;
  const jobId = (job as { id: string }).id;

  const { nodes, usage } = await distill(text);
  await recordUsage(supabase, { orgId: conn.org_id, kind: "distill", usage });

  if (nodes.length > 0) {
    await supabase.from("review_items").insert(
      nodes.map((n) => ({
        job_id: jobId,
        org_id: conn.org_id,
        space_id: conn.target_space_id,
        proposed: n,
        dup_candidates: [],
      })),
    );
  }

  // Mark every source item ingested (idempotency), regardless of node count.
  await supabase.from("ingested_sources").insert(
    items.map((i) => ({ org_id: conn.org_id, provider: conn.provider, external_id: i.externalId })),
  );

  await supabase
    .from("ingest_jobs")
    .update({ status: "ready", stats: { proposed: nodes.length } })
    .eq("id", jobId);

  return items.length;
}
