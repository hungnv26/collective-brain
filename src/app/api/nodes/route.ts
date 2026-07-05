import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseUnavailable } from "@/lib/supabase/guard";
import { storeNodeEmbedding } from "@/lib/ai/embed-node";
import { createNodeSchema } from "@/lib/validation/schemas";
import type { Node } from "@/lib/types";

/** GET /api/nodes?q=&orgId= — title search for the editor's [[ autocomplete. */
export async function GET(request: Request) {
  const unavailable = supabaseUnavailable();
  if (unavailable) return unavailable;

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim();
  const orgId = searchParams.get("orgId");
  if (!orgId) return NextResponse.json({ error: "orgId required" }, { status: 422 });

  const supabase = await createClient();
  let query = supabase.from("nodes").select("id, slug, title, type").eq("org_id", orgId).limit(8);
  if (q) query = query.ilike("title", `%${q}%`);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ nodes: data ?? [] });
}

/** POST /api/nodes — create a node (RPC snapshots v1 and resolves wikilinks). */
export async function POST(request: Request) {
  const unavailable = supabaseUnavailable();
  if (unavailable) return unavailable;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const parsed = createNodeSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "invalid" }, { status: 422 });
  }
  const { spaceId, type, title, body, confidence, status } = parsed.data;
  const { data, error } = await supabase.rpc("create_node", {
    p_space: spaceId,
    p_type: type,
    p_title: title,
    p_body: body,
    p_confidence: confidence ?? null,
    p_status: status,
  });
  if (error) {
    const forbidden = /row-level security|not permitted/.test(error.message);
    return NextResponse.json({ error: error.message }, { status: forbidden ? 403 : 400 });
  }
  await storeNodeEmbedding(supabase, data as Node); // keep the node retrievable by Ask
  return NextResponse.json({ node: data }, { status: 201 });
}
