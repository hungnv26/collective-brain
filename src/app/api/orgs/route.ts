import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseUnavailable } from "@/lib/supabase/guard";
import { createOrgSchema } from "@/lib/validation/schemas";

/** POST /api/orgs — create an org (owner membership + spaces) via the RPC. */
export async function POST(request: Request) {
  const unavailable = supabaseUnavailable();
  if (unavailable) return unavailable;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const parsed = createOrgSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "invalid" }, { status: 422 });
  }

  // Keep the public.users mirror in sync before creating anything.
  await supabase.rpc("ensure_self", {
    p_email: user.email,
    p_name: (user.user_metadata?.full_name as string | undefined) ?? null,
    p_avatar: (user.user_metadata?.avatar_url as string | undefined) ?? null,
  });

  const { data, error } = await supabase.rpc("create_org", {
    p_name: parsed.data.name,
    p_slug: parsed.data.slug,
  });

  if (error) {
    const conflict = error.message.includes("orgs_slug_key") || error.code === "23505";
    return NextResponse.json(
      { error: conflict ? "That slug is already taken" : error.message },
      { status: conflict ? 409 : 400 },
    );
  }
  return NextResponse.json({ org: data }, { status: 201 });
}
