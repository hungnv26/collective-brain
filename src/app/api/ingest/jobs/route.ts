import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseUnavailable } from "@/lib/supabase/guard";
import { isDistillerConfigured } from "@/lib/ai/distill";
import { runIngest } from "@/lib/ingest/pipeline";
import { ingestJobSchema } from "@/lib/validation/schemas";

// Distillation can take 10-30s; give the route room.
export const maxDuration = 60;

/** POST /api/ingest/jobs — run the ingest pipeline and create the review queue. */
export async function POST(request: Request) {
  const unavailable = supabaseUnavailable();
  if (unavailable) return unavailable;
  if (!isDistillerConfigured()) {
    return NextResponse.json(
      { error: "Ingest needs ANTHROPIC_API_KEY set to call Claude." },
      { status: 503 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const parsed = ingestJobSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "invalid" }, { status: 422 });
  }

  try {
    const result = await runIngest(supabase, parsed.data);
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Ingest failed" },
      { status: 400 },
    );
  }
}
