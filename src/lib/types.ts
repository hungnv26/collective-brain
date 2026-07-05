export type MembershipRole = "owner" | "admin" | "lead" | "member" | "viewer";
export type SpaceKind = "private" | "team" | "org";
export type NodeStatus = "draft" | "reviewed" | "stale" | "archived";

export interface Org {
  id: string;
  name: string;
  slug: string;
  region: string;
  plan: string;
}

export interface Membership {
  id: string;
  org_id: string;
  user_id: string;
  role: MembershipRole;
}

export interface Space {
  id: string;
  org_id: string;
  kind: SpaceKind;
  owner_user_id: string | null;
  team_id: string | null;
  name: string;
}
