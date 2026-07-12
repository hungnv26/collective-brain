import { NextResponse } from "next/server";
import { z } from "zod";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { supabaseUnavailable } from "@/lib/supabase/guard";
import { getMembership, getMyOrgs } from "@/lib/data/session";
import { verifyTelegramToken } from "@/lib/connectors/telegram";

const schema = z.object({ token: z.string().trim().min(20) });

/**
 * POST /api/connectors/telegram/connect — Telegram uses a bot token, not OAuth.
 * The owner/admin pastes a token; we verify it via getMe and store it via the
 * service role into connection_secrets.
 */
export async function POST(request: Request) {
  const unavailable = supabaseUnavailable();
  if (unavailable) return unavailable;

  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "A bot token is required." }, { status: 422 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const orgs = await getMyOrgs();
  const selected = (await cookies()).get("cb_org")?.value;
  const org = orgs.find((o) => o.id === selected) ?? orgs[0];
  if (!org) return NextResponse.json({ error: "no org" }, { status: 400 });

  const membership = await getMembership(org.id);
  if (membership?.role !== "owner" && membership?.role !== "admin") {
    return NextResponse.json({ error: "Only owners and admins can connect channels." }, { status: 403 });
  }

  const check = await verifyTelegramToken(parsed.data.token);
  if (!check.ok) return NextResponse.json({ error: "That bot token didn't work." }, { status: 400 });

  const service = createServiceClient();
  const { data: conn } = await service
    .from("connections")
    .insert({ org_id: org.id, provider: "telegram", status: "active", created_by: user.id })
    .select("id")
    .single();
  if (conn) {
    await service
      .from("connection_secrets")
      .insert({ connection_id: (conn as { id: string }).id, secrets: { bot_token: parsed.data.token } });
  }

  return NextResponse.json({ ok: true, bot: check.username }, { status: 201 });
}
