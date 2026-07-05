import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseUnavailable } from "@/lib/supabase/guard";
import { storeNodeEmbedding } from "@/lib/ai/embed-node";
import { acceptItemSchema } from "@/lib/validation/schemas";
import type { Node } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/review-items/:id/accept — create the node, then embed it. */
export async function POST(request: Request, { params }: Ctx) {
  const unavailable = supabaseUnavailable();
  if (unavailable) return unavailable;

  const { id } = await params;
  const parsed = acceptItemSchema.safeParse(await request.json().catch(() => ({})));
  const overrides = parsed.success ? (parsed.data.overrides ?? {}) : {};

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("accept_review_item", {
    p_item: id,
    p_overrides: overrides,
  });
  if (error) {
    const forbidden = /row-level security|not permitted|already handled/.test(error.message);
    return NextResponse.json({ error: error.message }, { status: forbidden ? 403 : 400 });
  }
  const node = data as Node;
  await storeNodeEmbedding(supabase, node);
  return NextResponse.json({ node }, { status: 201 });
}
