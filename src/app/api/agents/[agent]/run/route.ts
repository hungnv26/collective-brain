import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { supabaseUnavailable } from "@/lib/supabase/guard";
import { getMembership, getMyOrgs } from "@/lib/data/session";
import { runAgent } from "@/lib/agents/run";
import { AGENTS, type AgentName } from "@/lib/agents/report";

type Ctx = { params: Promise<{ agent: string }> };

/** POST /api/agents/:agent/run — owner/admin runs a maintenance agent. */
export async function POST(_request: Request, { params }: Ctx) {
  const unavailable = supabaseUnavailable();
  if (unavailable) return unavailable;

  const { agent } = await params;
  if (!AGENTS.includes(agent as AgentName)) {
    return NextResponse.json({ error: "Unknown agent." }, { status: 404 });
  }

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
    return NextResponse.json({ error: "Only owners and admins can run maintenance." }, { status: 403 });
  }

  try {
    const { report } = await runAgent(supabase, org.id, agent as AgentName, user.id);
    return NextResponse.json({ report }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Agent run failed." },
      { status: 400 },
    );
  }
}
