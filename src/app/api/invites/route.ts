import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseUnavailable } from "@/lib/supabase/guard";
import { createInviteSchema } from "@/lib/validation/schemas";
import { sendInviteEmail } from "@/lib/email/invite";

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

  const invite = data as { token: string };

  // Best-effort email delivery. If no provider is configured (or it fails), the
  // invite still stands — the UI falls back to the copyable join link.
  const { data: org } = await supabase
    .from("orgs")
    .select("name")
    .eq("id", parsed.data.orgId)
    .maybeSingle();
  const inviteUrl = `${new URL(request.url).origin}/join?token=${invite.token}`;
  const emailResult = await sendInviteEmail({
    to: parsed.data.email,
    inviteUrl,
    orgName: (org as { name: string } | null)?.name ?? "your team",
    inviterEmail: user.email,
    role: parsed.data.role,
  });

  return NextResponse.json({ invite: data, emailed: emailResult.sent }, { status: 201 });
}
