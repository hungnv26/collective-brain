import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { cronSecret } from "@/lib/env";
import { syncConnection, type Connection } from "@/lib/connectors/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/cron/sync — poll every active connection and ingest new items. Runs
 * with the service-role client (no user session), so it's gated by CRON_SECRET,
 * the bearer token the scheduler presents. No-op until connectors are
 * registered and connections exist.
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
  const { data, error } = await supabase
    .from("connections")
    .select("id, org_id, provider, status, target_space_id, config, sync_cursor")
    .eq("status", "active");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let connections = 0;
  let ingested = 0;
  for (const conn of (data ?? []) as Connection[]) {
    const r = await syncConnection(supabase, conn);
    connections += 1;
    ingested += r.ingested;
  }

  return NextResponse.json({ connections, ingested });
}
