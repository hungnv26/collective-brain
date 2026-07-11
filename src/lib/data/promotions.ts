import { createClient } from "@/lib/supabase/server";
import type { PromotionListItem } from "@/lib/types";

/**
 * Pending promotions the caller may act on or has requested. The RPC is
 * SECURITY DEFINER with a scoped disclosure (requester OR can-write-target),
 * so RLS-safe node previews reach approvers without granting them the source
 * space. `can_approve` drives whether the Approve/Reject actions render.
 */
export async function listPromotions(orgId: string): Promise<PromotionListItem[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("list_promotions", { p_org: orgId });
  return (data ?? []) as PromotionListItem[];
}
