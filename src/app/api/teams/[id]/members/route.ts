import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseUnavailable } from "@/lib/supabase/guard";
import { addTeamMemberSchema } from "@/lib/validation/schemas";

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/teams/:id/members — add a member to a team (RLS: owner/admin). */
export async function POST(request: Request, { params }: Ctx) {
  const unavailable = supabaseUnavailable();
  if (unavailable) return unavailable;

  const { id } = await params;
  const parsed = addTeamMemberSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "A user is required." }, { status: 422 });
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("team_members")
    .upsert(
      { team_id: id, user_id: parsed.data.userId, is_lead: parsed.data.isLead },
      { onConflict: "team_id,user_id" },
    );
  if (error) {
    const forbidden = /row-level security/.test(error.message);
    return NextResponse.json(
      { error: forbidden ? "Only owners and admins can manage teams." : error.message },
      { status: forbidden ? 403 : 400 },
    );
  }
  return NextResponse.json({ ok: true }, { status: 201 });
}
