import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Membership, Org, Space } from "@/lib/types";

/** The signed-in user, or null. */
export async function getUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/** Redirect to /login if not signed in; otherwise return the user. */
export async function requireUser() {
  const user = await getUser();
  if (!user) redirect("/login");
  return user;
}

/** Orgs the current user belongs to (RLS-filtered), newest first. */
export async function getMyOrgs(): Promise<Org[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("memberships")
    .select("orgs(*)")
    .order("created_at", { ascending: false });
  return (data ?? [])
    .flatMap((row) => (row as unknown as { orgs: Org | null }).orgs ?? [])
    .filter(Boolean) as Org[];
}

/** The user's membership row for an org (or null if not a member). */
export async function getMembership(orgId: string): Promise<Membership | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("memberships").select("*").eq("org_id", orgId).maybeSingle();
  return (data as Membership | null) ?? null;
}

/**
 * Spaces the user can read in an org. RLS guarantees this only ever returns
 * spaces the caller may see — no app-side filtering needed.
 */
export async function getVisibleSpaces(orgId: string): Promise<Space[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("spaces").select("*").eq("org_id", orgId);
  return (data ?? []) as Space[];
}
