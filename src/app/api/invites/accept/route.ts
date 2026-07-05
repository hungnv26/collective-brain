import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseUnavailable } from "@/lib/supabase/guard";
import { acceptInviteSchema } from "@/lib/validation/schemas";

/** POST /api/invites/accept — join an org from an invite token. */
export async function POST(request: Request) {
  const unavailable = supabaseUnavailable();
  if (unavailable) return unavailable;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const parsed = acceptInviteSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid token" }, { status: 422 });
  }

  await supabase.rpc("ensure_self", {
    p_email: user.email,
    p_name: (user.user_metadata?.full_name as string | undefined) ?? null,
    p_avatar: (user.user_metadata?.avatar_url as string | undefined) ?? null,
  });

  const { data, error } = await supabase.rpc("accept_invite", { p_token: parsed.data.token });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ org: data }, { status: 200 });
}
