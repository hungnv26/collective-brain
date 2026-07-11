import type { SupabaseClient } from "@supabase/supabase-js";

export interface TokenUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export type UsageKind = "ask" | "distill";

export interface UsageRow {
  kind: string;
  model: string;
  calls: number;
  input_tokens: number;
  output_tokens: number;
}

/** Start of the current UTC month — the window for month-to-date rollups + caps. */
export function monthStart(now = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

const DEFAULT_CAP = 5_000_000;

/** Per-org monthly token budget (input + output). Override with CB_MONTHLY_TOKEN_CAP. */
export function monthlyTokenCap(): number {
  const v = Number(process.env.CB_MONTHLY_TOKEN_CAP);
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_CAP;
}

/** Pure: has this org reached its monthly token budget? */
export function overCap(usedTokens: number, cap = monthlyTokenCap()): boolean {
  return usedTokens >= cap;
}

/** Total tokens (input + output) across a set of summary rows. */
export function totalTokens(rows: UsageRow[]): number {
  return rows.reduce((s, r) => s + Number(r.input_tokens) + Number(r.output_tokens), 0);
}

/**
 * Append a usage event. Best-effort: metering must never break the feature it
 * measures, so failures are swallowed.
 */
export async function recordUsage(
  supabase: SupabaseClient,
  e: { orgId: string; userId?: string | null; kind: UsageKind; usage: TokenUsage },
): Promise<void> {
  try {
    await supabase.from("usage_events").insert({
      org_id: e.orgId,
      user_id: e.userId ?? null,
      kind: e.kind,
      model: e.usage.model,
      input_tokens: e.usage.inputTokens,
      output_tokens: e.usage.outputTokens,
    });
  } catch {
    /* metering is best-effort */
  }
}

/** Month-to-date usage summary rows for an org. */
export async function usageThisMonth(supabase: SupabaseClient, orgId: string): Promise<UsageRow[]> {
  const { data } = await supabase.rpc("usage_summary", { p_org: orgId, p_since: monthStart() });
  return (data ?? []) as UsageRow[];
}

/** Month-to-date total tokens for an org — the number the cap is checked against. */
export async function monthToDateTokens(supabase: SupabaseClient, orgId: string): Promise<number> {
  return totalTokens(await usageThisMonth(supabase, orgId));
}
