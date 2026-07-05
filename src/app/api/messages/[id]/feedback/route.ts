import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseUnavailable } from "@/lib/supabase/guard";
import { feedbackSchema } from "@/lib/validation/schemas";

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/messages/:id/feedback — thumbs up/down on an answer. */
export async function POST(request: Request, { params }: Ctx) {
  const unavailable = supabaseUnavailable();
  if (unavailable) return unavailable;

  const { id } = await params;
  const parsed = feedbackSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 422 });

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("messages")
    .update({ feedback: parsed.data.feedback })
    .eq("id", id)
    .select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data?.length) return NextResponse.json({ error: "not found" }, { status: 403 });
  return NextResponse.json({ ok: true });
}
