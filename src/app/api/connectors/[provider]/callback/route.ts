import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { supabaseUnavailable } from "@/lib/supabase/guard";
import { getMembership } from "@/lib/data/session";
import { CONNECTORS } from "@/lib/connectors/registry";

type Ctx = { params: Promise<{ provider: string }> };

/** GET /api/connectors/:provider/callback — finish OAuth, store the connection. */
export async function GET(request: Request, { params }: Ctx) {
  const unavailable = supabaseUnavailable();
  if (unavailable) return unavailable;

  const { provider } = await params;
  const { searchParams, origin } = new URL(request.url);
  if (provider !== "slack" && provider !== "gmail") {
    return NextResponse.redirect(`${origin}/connections?error=provider`);
  }

  const code = searchParams.get("code");
  const orgId = searchParams.get("state");
  if (!code || !orgId) return NextResponse.redirect(`${origin}/connections?error=oauth`);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));

  // Re-verify the caller is owner/admin of the org named in `state`.
  const membership = await getMembership(orgId);
  if (membership?.role !== "owner" && membership?.role !== "admin") {
    return NextResponse.redirect(`${origin}/connections?error=forbidden`);
  }

  const connector = CONNECTORS[provider];
  if (!connector?.exchangeCode) return NextResponse.redirect(`${origin}/connections?error=oauth`);

  try {
    const redirectUri = `${origin}/api/connectors/${provider}/callback`;
    const secrets = await connector.exchangeCode(code, redirectUri);

    // Service role: connection_secrets is service-role only.
    const service = createServiceClient();
    const { data: conn } = await service
      .from("connections")
      .insert({ org_id: orgId, provider, status: "active", created_by: user.id })
      .select("id")
      .single();
    if (conn) {
      await service
        .from("connection_secrets")
        .insert({ connection_id: (conn as { id: string }).id, secrets });
    }
    return NextResponse.redirect(`${origin}/connections?connected=${provider}`);
  } catch {
    return NextResponse.redirect(`${origin}/connections?error=oauth`);
  }
}
