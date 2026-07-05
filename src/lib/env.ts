// Centralised env access. NEXT_PUBLIC_* are inlined by Next at build time, so
// they must be referenced as literal member expressions (they are, below).

export function supabaseUrl(): string {
  const v = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!v) throw new Error("Missing env NEXT_PUBLIC_SUPABASE_URL");
  return v;
}

export function supabaseAnonKey(): string {
  const v = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!v) throw new Error("Missing env NEXT_PUBLIC_SUPABASE_ANON_KEY");
  return v;
}

/** True when Supabase is configured — lets the UI show a setup hint instead of crashing. */
export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
