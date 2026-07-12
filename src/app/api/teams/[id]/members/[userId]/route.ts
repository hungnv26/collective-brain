import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseUnavailable } from "@/lib/supabase/guard";

type Ctx = { params: Promise<{ id: string; userId: string }> };

/** DELETE /api/teams/:id/members/:userId — remove a member (RLS: owner/admin). */
export async function DELETE(_request: Request, { params }: Ctx) {
  const unavailable = supabaseUnavailable();
  if (unavailable) return unavailable;

  const { id, userId } = await params;
  const supabase = await createClient();
  const { error } = await supabase
    .from("team_members")
    .delete()
    .eq("team_id", id)
    .eq("user_id", userId);
  if (error) {
    const forbidden = /row-level security/.test(error.message);
    return NextResponse.json(
      { error: forbidden ? "Only owners and admins can manage teams." : error.message },
      { status: forbidden ? 403 : 400 },
    );
  }
  return NextResponse.json({ ok: true });
}
