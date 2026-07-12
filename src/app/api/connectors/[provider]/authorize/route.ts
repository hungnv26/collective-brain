import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { supabaseUnavailable } from "@/lib/supabase/guard";
import { getMembership, getMyOrgs } from "@/lib/data/session";
import { CONNECTORS } from "@/lib/connectors/registry";
import { connectorConfigured } from "@/lib/env";

type Ctx = { params: Promise<{ provider: string }> };

/** GET /api/connectors/:provider/authorize — kick off OAuth (owner/admin). */
export async function GET(request: Request, { params }: Ctx) {
  const unavailable = supabaseUnavailable();
  if (unavailable) return unavailable;

  const { provider } = await params;
  if (provider !== "slack" && provider !== "gmail") {
    return NextResponse.json({ error: "unknown provider" }, { status: 404 });
  }
  if (!connectorConfigured(provider)) {
    return NextResponse.json({ error: `${provider} OAuth is not configured.` }, { status: 503 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));

  const orgs = await getMyOrgs();
  const selected = (await cookies()).get("cb_org")?.value;
  const org = orgs.find((o) => o.id === selected) ?? orgs[0];
  if (!org) return NextResponse.json({ error: "no org" }, { status: 400 });

  const membership = await getMembership(org.id);
  if (membership?.role !== "owner" && membership?.role !== "admin") {
    return NextResponse.json({ error: "Only owners and admins can connect channels." }, { status: 403 });
  }

  const connector = CONNECTORS[provider];
  if (!connector?.authUrl) return NextResponse.json({ error: "provider has no OAuth" }, { status: 400 });

  const origin = new URL(request.url).origin;
  const redirectUri = `${origin}/api/connectors/${provider}/callback`;
  // The org id rides in `state`; the callback re-verifies the user's role there.
  return NextResponse.redirect(connector.authUrl(redirectUri, org.id));
}
