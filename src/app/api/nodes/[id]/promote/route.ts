import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseUnavailable } from "@/lib/supabase/guard";
import { promoteNodeSchema } from "@/lib/validation/schemas";

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/nodes/:id/promote — request promotion of a node into a space. */
export async function POST(request: Request, { params }: Ctx) {
  const unavailable = supabaseUnavailable();
  if (unavailable) return unavailable;

  const { id } = await params;
  const parsed = promoteNodeSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "A target space is required." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("request_promotion", {
    p_node: id,
    p_to_space: parsed.data.toSpaceId,
  });
  if (error) {
    const forbidden = /row-level security|not permitted/.test(error.message);
    return NextResponse.json({ error: error.message }, { status: forbidden ? 403 : 400 });
  }
  return NextResponse.json({ promotion: data }, { status: 201 });
}
