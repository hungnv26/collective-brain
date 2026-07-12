import { createClient } from "@/lib/supabase/server";

export interface TeamMemberRow {
  user_id: string;
  email: string | null;
  is_lead: boolean;
}

export interface TeamSpaceRow {
  id: string;
  name: string;
}

export interface Team {
  id: string;
  name: string;
  members: TeamMemberRow[];
  spaces: TeamSpaceRow[];
}

/**
 * Teams in an org with their members and team spaces. All reads are RLS-scoped:
 * org members may see teams and their rosters; team spaces follow the usual
 * space visibility.
 */
export async function listTeams(orgId: string): Promise<Team[]> {
  const supabase = await createClient();

  const { data: teamRows } = await supabase
    .from("teams")
    .select("id, name")
    .eq("org_id", orgId)
    .order("name");
  const teams = (teamRows ?? []) as { id: string; name: string }[];
  if (teams.length === 0) return [];

  const teamIds = teams.map((t) => t.id);
  const [{ data: memberRows }, { data: spaceRows }] = await Promise.all([
    supabase.from("team_members").select("team_id, user_id, is_lead, users(email)").in("team_id", teamIds),
    supabase.from("spaces").select("id, name, team_id").eq("org_id", orgId).eq("kind", "team"),
  ]);

  type M = { team_id: string; user_id: string; is_lead: boolean; users: { email: string | null } | null };
  type S = { id: string; name: string; team_id: string | null };
  const members = (memberRows ?? []) as unknown as M[];
  const spaces = (spaceRows ?? []) as S[];

  return teams.map((t) => ({
    id: t.id,
    name: t.name,
    members: members
      .filter((m) => m.team_id === t.id)
      .map((m) => ({ user_id: m.user_id, email: m.users?.email ?? null, is_lead: m.is_lead })),
    spaces: spaces.filter((s) => s.team_id === t.id).map((s) => ({ id: s.id, name: s.name })),
  }));
}
