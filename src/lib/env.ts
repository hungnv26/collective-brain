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

/** Resend API key for transactional email (invites). Optional. */
export function resendApiKey(): string | undefined {
  return process.env.RESEND_API_KEY || undefined;
}

/** From-address for outbound email, e.g. "Collective Brain <invites@yourco.com>". */
export function emailFrom(): string {
  return process.env.CB_EMAIL_FROM || "Collective Brain <onboarding@resend.dev>";
}

/** True when transactional email can actually be sent (a provider key is set). */
export function isEmailConfigured(): boolean {
  return Boolean(resendApiKey());
}

/** Server-only privileged key for cross-org background jobs (cron). */
export function serviceRoleKey(): string {
  const v = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!v) throw new Error("Missing env SUPABASE_SERVICE_ROLE_KEY");
  return v;
}

/** Shared secret the cron scheduler must present. */
export function cronSecret(): string | undefined {
  return process.env.CRON_SECRET || undefined;
}

// ---------- connector OAuth apps (server-only) ----------
export function slackClientId(): string | undefined {
  return process.env.SLACK_CLIENT_ID || undefined;
}
export function slackClientSecret(): string | undefined {
  return process.env.SLACK_CLIENT_SECRET || undefined;
}
export function googleClientId(): string | undefined {
  return process.env.GOOGLE_CLIENT_ID || undefined;
}
export function googleClientSecret(): string | undefined {
  return process.env.GOOGLE_CLIENT_SECRET || undefined;
}

/** Which connector providers have their OAuth app configured. */
export function connectorConfigured(provider: "slack" | "gmail"): boolean {
  if (provider === "slack") return Boolean(slackClientId() && slackClientSecret());
  return Boolean(googleClientId() && googleClientSecret());
}
