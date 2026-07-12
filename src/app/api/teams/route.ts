import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { supabaseUnavailable } from "@/lib/supabase/guard";
import { getMyOrgs } from "@/lib/data/session";
import { createTeamSchema } from "@/lib/validation/schemas";

/** POST /api/teams — create a team in the current org (RLS: owner/admin only). */
export async function POST(request: Request) {
  const unavailable = supabaseUnavailable();
  if (unavailable) return unavailable;

  const parsed = createTeamSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "invalid" }, { status: 422 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const orgs = await getMyOrgs();
  const selected = (await cookies()).get("cb_org")?.value;
  const org = orgs.find((o) => o.id === selected) ?? orgs[0];
  if (!org) return NextResponse.json({ error: "no org" }, { status: 400 });

  const { data, error } = await supabase
    .from("teams")
    .insert({ org_id: org.id, name: parsed.data.name })
    .select("id, name")
    .single();
  if (error) {
    const forbidden = /row-level security/.test(error.message);
    return NextResponse.json(
      { error: forbidden ? "Only owners and admins can create teams." : error.message },
      { status: forbidden ? 403 : 400 },
    );
  }
  return NextResponse.json({ team: data }, { status: 201 });
}
