import { createClient } from "@/lib/supabase/server";
import type { MembershipRole } from "@/lib/types";

export interface Member {
  user_id: string;
  email: string | null;
  name: string | null;
  role: MembershipRole;
}

export interface PendingInvite {
  id: string;
  email: string;
  role: MembershipRole;
  token: string;
  created_at: string;
}

/** Members of an org (RLS: any member may read the roster). */
export async function listMembers(orgId: string): Promise<Member[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("memberships")
    .select("user_id, role, users(email, name)")
    .eq("org_id", orgId);

  type Row = { user_id: string; role: MembershipRole; users: { email: string | null; name: string | null } | null };
  return ((data ?? []) as unknown as Row[])
    .map((r) => ({ user_id: r.user_id, role: r.role, email: r.users?.email ?? null, name: r.users?.name ?? null }))
    .sort((a, b) => (a.email ?? "").localeCompare(b.email ?? ""));
}

/**
 * Outstanding invites (RLS: only owner/admin can read the invites table, so a
 * plain member gets an empty list here).
 */
export async function listPendingInvites(orgId: string): Promise<PendingInvite[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("invites")
    .select("id, email, role, token, created_at")
    .eq("org_id", orgId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  return (data ?? []) as PendingInvite[];
}
