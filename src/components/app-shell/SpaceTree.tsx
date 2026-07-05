import { groupSpaces } from "@/lib/perm/spaces";
import type { Space } from "@/lib/types";

const SECTIONS: { key: "org" | "team" | "private"; label: string }[] = [
  { key: "org", label: "Org" },
  { key: "team", label: "Teams" },
  { key: "private", label: "Private" },
];

export function SpaceTree({ spaces }: { spaces: Space[] }) {
  const tree = groupSpaces(spaces);
  return (
    <nav className="space-y-4 px-2 py-3 text-sm">
      {SECTIONS.map(({ key, label }) => (
        <div key={key}>
          <p className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
          {tree[key].length === 0 ? (
            <p className="px-2 py-1 text-xs text-muted/70">None</p>
          ) : (
            <ul>
              {tree[key].map((s) => (
                <li key={s.id}>
                  <span className="flex cursor-default items-center gap-2 rounded-md px-2 py-1 hover:bg-panel">
                    <span className="text-muted">{key === "private" ? "◆" : key === "team" ? "▲" : "●"}</span>
                    <span className="truncate">{s.name}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </nav>
  );
}
