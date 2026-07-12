import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { supabaseUnavailable } from "@/lib/supabase/guard";

type Ctx = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  target_space_id: z.string().uuid().nullable().optional(),
  status: z.enum(["active", "paused"]).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
});

/** PATCH /api/connections/:id — set target space, config, or pause (RLS: owner/admin). */
export async function PATCH(request: Request, { params }: Ctx) {
  const unavailable = supabaseUnavailable();
  if (unavailable) return unavailable;

  const { id } = await params;
  const parsed = patchSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 422 });

  const supabase = await createClient();
  const { error } = await supabase.from("connections").update(parsed.data).eq("id", id);
  if (error) {
    const forbidden = /row-level security/.test(error.message);
    return NextResponse.json(
      { error: forbidden ? "Only owners and admins can manage connections." : error.message },
      { status: forbidden ? 403 : 400 },
    );
  }
  return NextResponse.json({ ok: true });
}

/** DELETE /api/connections/:id — remove a connection (RLS: owner/admin). */
export async function DELETE(_request: Request, { params }: Ctx) {
  const unavailable = supabaseUnavailable();
  if (unavailable) return unavailable;

  const { id } = await params;
  const supabase = await createClient();
  const { error } = await supabase.from("connections").delete().eq("id", id);
  if (error) {
    const forbidden = /row-level security/.test(error.message);
    return NextResponse.json(
      { error: forbidden ? "Only owners and admins can manage connections." : error.message },
      { status: forbidden ? 403 : 400 },
    );
  }
  return NextResponse.json({ ok: true });
}
