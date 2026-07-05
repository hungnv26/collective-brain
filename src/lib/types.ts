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

export const NODE_TYPES = [
  "fact",
  "decision",
  "sop",
  "person",
  "client",
  "project",
  "meeting",
  "idea",
] as const;
export type NodeType = (typeof NODE_TYPES)[number];

export interface Node {
  id: string;
  org_id: string;
  space_id: string;
  type: string;
  title: string;
  slug: string;
  body_md: string;
  frontmatter: Record<string, unknown>;
  confidence: string | null;
  status: NodeStatus;
  created_by: string | null;
  source_ref: string | null;
  created_at: string;
  updated_at: string;
}

export interface NodeVersion {
  id: string;
  node_id: string;
  body_md: string;
  edited_by: string | null;
  created_at: string;
}

export type IngestStatus = "queued" | "extracting" | "distilling" | "ready" | "failed";

export interface IngestJob {
  id: string;
  org_id: string;
  space_id: string;
  source_kind: "paste" | "file" | "url";
  source_uri: string | null;
  status: IngestStatus;
  error: string | null;
  stats: { proposed?: number; dupes?: number; chars?: number };
  created_at: string;
}

export interface ProposedNodeData {
  title: string;
  type: string;
  confidence: "low" | "medium" | "high";
  body_md: string;
}

export interface DupCandidate {
  node_id: string;
  title: string;
  score: number;
}

export interface ReviewItem {
  id: string;
  job_id: string;
  space_id: string;
  proposed: ProposedNodeData;
  dup_candidates: DupCandidate[];
  status: "pending" | "accepted" | "edited" | "rejected";
  created_node: string | null;
}

export interface Citation {
  n: number;
  node_id: string;
  title: string;
}

export interface Conversation {
  id: string;
  title: string;
  updated_at: string;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations: Citation[];
  feedback: "up" | "down" | null;
}
