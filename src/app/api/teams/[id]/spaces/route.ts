import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseUnavailable } from "@/lib/supabase/guard";
import { createTeamSpaceSchema } from "@/lib/validation/schemas";

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/teams/:id/spaces — create a team space (RLS: owner/admin at beta). */
export async function POST(request: Request, { params }: Ctx) {
  const unavailable = supabaseUnavailable();
  if (unavailable) return unavailable;

  const { id } = await params;
  const parsed = createTeamSpaceSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "invalid" }, { status: 422 });
  }

  const supabase = await createClient();
  // Derive org from the team (RLS: readable only within the caller's org).
  const { data: team } = await supabase.from("teams").select("org_id").eq("id", id).maybeSingle();
  if (!team) return NextResponse.json({ error: "team not found" }, { status: 404 });

  // NB: no .select() here. INSERT ... RETURNING re-checks the SELECT policy
  // (can_read_space) against the new row, but can_read_space re-queries the
  // spaces table by id and the just-inserted row isn't visible in that snapshot
  // yet — so returning it fails RLS even though the insert is allowed. The UI
  // refetches via listTeams (a normal read) after this resolves.
  const { error } = await supabase
    .from("spaces")
    .insert({ org_id: (team as { org_id: string }).org_id, kind: "team", team_id: id, name: parsed.data.name });
  if (error) {
    const forbidden = /row-level security/.test(error.message);
    return NextResponse.json(
      { error: forbidden ? "Only owners and admins can create team spaces." : error.message },
      { status: forbidden ? 403 : 400 },
    );
  }
  return NextResponse.json({ ok: true }, { status: 201 });
}
