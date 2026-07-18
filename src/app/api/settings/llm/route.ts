import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { supabaseUnavailable } from "@/lib/supabase/guard";
import { getMyOrgs } from "@/lib/data/session";
import { llmSettingsSchema } from "@/lib/validation/schemas";

/** PUT /api/settings/llm — save the current org's LLM provider override (RLS: owner/admin). */
export async function PUT(request: Request) {
  const unavailable = supabaseUnavailable();
  if (unavailable) return unavailable;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const parsed = llmSettingsSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "invalid" }, { status: 422 });
  }

  const orgs = await getMyOrgs();
  const selected = (await cookies()).get("cb_org")?.value;
  const org = orgs.find((o) => o.id === selected) ?? orgs[0];
  if (!org) return NextResponse.json({ error: "no org" }, { status: 400 });

  const { error } = await supabase.from("org_settings").upsert(
    {
      org_id: org.id,
      llm_provider: parsed.data.provider ?? null,
      distill_model: parsed.data.distillModel ?? null,
      answer_model: parsed.data.answerModel ?? null,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "org_id" },
  );
  if (error) {
    const forbidden = /row-level security/.test(error.message);
    return NextResponse.json(
      { error: forbidden ? "Only owners and admins can change LLM settings." : error.message },
      { status: forbidden ? 403 : 400 },
    );
  }
  return NextResponse.json({ ok: true });
}
