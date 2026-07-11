import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { cronSecret } from "@/lib/env";
import { runAgent } from "@/lib/agents/run";
import { AGENTS } from "@/lib/agents/report";
import { sendDigestEmail, type DigestReport } from "@/lib/email/digest";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/cron/maintenance — scheduled maintenance sweep. Runs every agent for
 * every org and emails the weekly digest to each org's owners/admins. Runs with
 * the service-role client (no user session), so it's gated by CRON_SECRET, the
 * shared secret Vercel Cron presents as a bearer token.
 */
export async function GET(request: Request) {
  const secret = cronSecret();
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured." }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const { data: orgs, error } = await supabase.from("orgs").select("id, name");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let orgsProcessed = 0;
  let emailsSent = 0;

  for (const org of (orgs ?? []) as { id: string; name: string }[]) {
    // Digest first so we can email it; then the rest of the sweep.
    const { report } = await runAgent(supabase, org.id, "digest");
    for (const agent of AGENTS.filter((a) => a !== "digest")) {
      await runAgent(supabase, org.id, agent);
    }
    orgsProcessed++;

    // Email the digest to this org's owners/admins.
    const { data: admins } = await supabase
      .from("memberships")
      .select("users(email)")
      .eq("org_id", org.id)
      .in("role", ["owner", "admin"]);
    const recipients = ((admins ?? []) as unknown as { users: { email: string | null } | null }[])
      .map((m) => m.users?.email)
      .filter((e): e is string => Boolean(e));
    const result = await sendDigestEmail(recipients, org.name, report as unknown as DigestReport);
    if (result.sent) emailsSent++;
  }

  return NextResponse.json({ orgsProcessed, emailsSent });
}
