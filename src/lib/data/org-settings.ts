import type { SupabaseClient } from "@supabase/supabase-js";
import type { OrgLlmOverride, ProviderId } from "@/lib/ai/provider";

interface OrgSettingsRow {
  org_id: string;
  llm_provider: ProviderId | null;
  distill_model: string | null;
  answer_model: string | null;
  updated_at: string | null;
}

/**
 * The org's saved LLM override, or null if none is set. Maps the DB row to the
 * `OrgLlmOverride` shape `resolveLlmConfig()` expects. RLS scopes the read to
 * the caller's own org, so this is safe to call with any authenticated client.
 */
export async function getOrgLlmOverride(
  supabase: SupabaseClient,
  orgId: string,
): Promise<OrgLlmOverride | null> {
  const { data } = await supabase
    .from("org_settings")
    .select("llm_provider, distill_model, answer_model")
    .eq("org_id", orgId)
    .maybeSingle();
  if (!data) return null;
  const row = data as Pick<OrgSettingsRow, "llm_provider" | "distill_model" | "answer_model">;
  return {
    provider: row.llm_provider,
    distillModel: row.distill_model,
    answerModel: row.answer_model,
  };
}

/** The full settings row (incl. updated_at) for display on the admin page. */
export async function getOrgSettings(
  supabase: SupabaseClient,
  orgId: string,
): Promise<OrgSettingsRow | null> {
  const { data } = await supabase
    .from("org_settings")
    .select("org_id, llm_provider, distill_model, answer_model, updated_at")
    .eq("org_id", orgId)
    .maybeSingle();
  return (data as OrgSettingsRow | null) ?? null;
}
