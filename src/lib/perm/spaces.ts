import type { Space, SpaceKind } from "@/lib/types";

/**
 * App-side companion to the DB's read primitive. The database is the source of
 * truth (RLS only ever returns spaces the user may read); this just groups the
 * already-filtered list into the sidebar's Org / Teams / Private sections.
 */
export interface SpaceTree {
  org: Space[];
  team: Space[];
  private: Space[];
}

const ORDER: Record<SpaceKind, keyof SpaceTree> = {
  org: "org",
  team: "team",
  private: "private",
};

export function groupSpaces(spaces: Space[]): SpaceTree {
  const tree: SpaceTree = { org: [], team: [], private: [] };
  for (const s of spaces) tree[ORDER[s.kind]].push(s);
  for (const k of Object.keys(tree) as (keyof SpaceTree)[]) {
    tree[k].sort((a, b) => a.name.localeCompare(b.name));
  }
  return tree;
}
