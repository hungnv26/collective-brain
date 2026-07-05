import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseUnavailable } from "@/lib/supabase/guard";
import { storeNodeEmbedding } from "@/lib/ai/embed-node";
import { bulkAcceptSchema } from "@/lib/validation/schemas";
import type { Node } from "@/lib/types";

const RANK = { low: 0, medium: 1, high: 2 } as const;

/** POST /api/review-items/bulk — accept all pending items in a job at/above a confidence. */
export async function POST(request: Request) {
  const unavailable = supabaseUnavailable();
  if (unavailable) return unavailable;

  const parsed = bulkAcceptSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid" }, { status: 422 });
  }
  const { jobId, minConfidence } = parsed.data;
  const supabase = await createClient();

  const { data: items, error } = await supabase
    .from("review_items")
    .select("id, proposed")
    .eq("job_id", jobId)
    .eq("status", "pending");
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const eligible = (items ?? []).filter((it) => {
    const c = ((it as { proposed: { confidence?: string } }).proposed.confidence ?? "low") as keyof typeof RANK;
    return RANK[c] >= RANK[minConfidence];
  });

  let accepted = 0;
  for (const it of eligible) {
    const { data, error: accErr } = await supabase.rpc("accept_review_item", {
      p_item: (it as { id: string }).id,
      p_overrides: {},
    });
    if (accErr) continue; // skip items that fail (e.g. already handled)
    await storeNodeEmbedding(supabase, data as Node);
    accepted++;
  }

  return NextResponse.json({ accepted, considered: eligible.length });
}
