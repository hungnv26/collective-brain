import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseUnavailable } from "@/lib/supabase/guard";

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/promotions/:id/approve — approve; moves the node to the target space. */
export async function POST(_request: Request, { params }: Ctx) {
  const unavailable = supabaseUnavailable();
  if (unavailable) return unavailable;

  const { id } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("approve_promotion", { p_promotion: id });
  if (error) {
    const forbidden = /row-level security|not permitted/.test(error.message);
    return NextResponse.json({ error: error.message }, { status: forbidden ? 403 : 400 });
  }
  return NextResponse.json({ promotion: data });
}
