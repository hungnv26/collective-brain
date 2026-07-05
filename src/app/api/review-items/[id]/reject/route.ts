import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseUnavailable } from "@/lib/supabase/guard";

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/review-items/:id/reject — mark a proposed node rejected. */
export async function POST(_request: Request, { params }: Ctx) {
  const unavailable = supabaseUnavailable();
  if (unavailable) return unavailable;

  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const { data, error } = await supabase
    .from("review_items")
    .update({ status: "rejected", reviewed_by: user.id })
    .eq("id", id)
    .eq("status", "pending")
    .select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data?.length) return NextResponse.json({ error: "not found or not permitted" }, { status: 403 });
  return NextResponse.json({ ok: true });
}
