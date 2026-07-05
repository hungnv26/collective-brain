import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseUnavailable } from "@/lib/supabase/guard";
import { buildVaultZip } from "@/lib/export/vault";
import type { Node } from "@/lib/types";

/** GET /api/export?space=:id — download a space as an Obsidian-compatible vault zip. */
export async function GET(request: Request) {
  const unavailable = supabaseUnavailable();
  if (unavailable) return unavailable;

  const spaceId = new URL(request.url).searchParams.get("space");
  if (!spaceId) return NextResponse.json({ error: "space required" }, { status: 422 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const { data: space } = await supabase
    .from("spaces")
    .select("name")
    .eq("id", spaceId)
    .maybeSingle();
  if (!space) return NextResponse.json({ error: "not found or not permitted" }, { status: 404 });

  const { data: nodes } = await supabase.from("nodes").select("*").eq("space_id", spaceId);
  const zip = await buildVaultZip((nodes ?? []) as Node[], (space as { name: string }).name);

  const filename = `${(space as { name: string }).name.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "vault"}.zip`;
  const body = new Uint8Array(zip); // pin the buffer type for BodyInit
  return new Response(body, {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  });
}
