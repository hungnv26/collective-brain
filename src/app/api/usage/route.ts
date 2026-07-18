import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { supabaseUnavailable } from "@/lib/supabase/guard";
import { getMyOrgs } from "@/lib/data/session";
import { monthlyCostCap, monthlyTokenCap, totalCost, totalTokens, usageThisMonth } from "@/lib/usage/meter";

/** GET /api/usage — month-to-date token usage for the current org, vs the cap. */
export async function GET() {
  const unavailable = supabaseUnavailable();
  if (unavailable) return unavailable;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const orgs = await getMyOrgs();
  const selected = (await cookies()).get("cb_org")?.value;
  const org = orgs.find((o) => o.id === selected) ?? orgs[0];
  if (!org) return NextResponse.json({ error: "no org" }, { status: 400 });

  const rows = await usageThisMonth(supabase, org.id);
  return NextResponse.json({
    monthToDate: totalTokens(rows),
    cap: monthlyTokenCap(),
    costUsd: totalCost(rows),
    costCap: monthlyCostCap(),
    byKind: rows,
  });
}
