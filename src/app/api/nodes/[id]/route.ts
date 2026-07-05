import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseUnavailable } from "@/lib/supabase/guard";
import { storeNodeEmbedding } from "@/lib/ai/embed-node";
import { updateNodeSchema } from "@/lib/validation/schemas";
import type { Node } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/nodes/:id — a single node (used by the Ask citation panel). */
export async function GET(_request: Request, { params }: Ctx) {
  const unavailable = supabaseUnavailable();
  if (unavailable) return unavailable;
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("nodes")
    .select("id, title, type, body_md, space_id, status")
    .eq("id", id)
    .maybeSingle();
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ node: data });
}

/** PATCH /api/nodes/:id — update (RPC snapshots a version + re-resolves links). */
export async function PATCH(request: Request, { params }: Ctx) {
  const unavailable = supabaseUnavailable();
  if (unavailable) return unavailable;

  const { id } = await params;
  const parsed = updateNodeSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "invalid" }, { status: 422 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("update_node", {
    p_id: id,
    p_title: parsed.data.title ?? null,
    p_body: parsed.data.body ?? null,
    p_confidence: parsed.data.confidence ?? null,
    p_status: parsed.data.status ?? null,
  });
  if (error) {
    const forbidden = /row-level security|not permitted|not found/.test(error.message);
    return NextResponse.json({ error: error.message }, { status: forbidden ? 403 : 400 });
  }
  await storeNodeEmbedding(supabase, data as Node); // refresh the embedding on edit
  return NextResponse.json({ node: data });
}

/** DELETE /api/nodes/:id — remove a node (RLS: only where writable). */
export async function DELETE(_request: Request, { params }: Ctx) {
  const unavailable = supabaseUnavailable();
  if (unavailable) return unavailable;

  const { id } = await params;
  const supabase = await createClient();
  const { error, count } = await supabase.from("nodes").delete({ count: "exact" }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!count) return NextResponse.json({ error: "not found or not permitted" }, { status: 403 });
  return NextResponse.json({ ok: true });
}
