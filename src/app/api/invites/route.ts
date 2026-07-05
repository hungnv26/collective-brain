import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseUnavailable } from "@/lib/supabase/guard";
import { createInviteSchema } from "@/lib/validation/schemas";

/** POST /api/invites — admins/owners invite a member (RPC enforces the role). */
export async function POST(request: Request) {
  const unavailable = supabaseUnavailable();
  if (unavailable) return unavailable;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const parsed = createInviteSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "invalid" }, { status: 422 });
  }

  const { data, error } = await supabase.rpc("create_invite", {
    p_org: parsed.data.orgId,
    p_email: parsed.data.email,
    p_role: parsed.data.role,
  });

  if (error) {
    const forbidden = error.message.includes("insufficient privileges");
    return NextResponse.json({ error: error.message }, { status: forbidden ? 403 : 400 });
  }
  return NextResponse.json({ invite: data }, { status: 201 });
}
