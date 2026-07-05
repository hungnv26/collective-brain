import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/env";

/** Returns a 503 response when Supabase env is missing, else null. */
export function supabaseUnavailable(): NextResponse | null {
  if (isSupabaseConfigured()) return null;
  return NextResponse.json(
    { error: "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and _ANON_KEY." },
    { status: 503 },
  );
}
