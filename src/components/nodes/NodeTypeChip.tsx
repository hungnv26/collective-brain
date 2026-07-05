const COLOR: Record<string, string> = {
  fact: "var(--type-fact)",
  decision: "var(--type-decision)",
  sop: "var(--type-sop)",
  person: "var(--type-person)",
  client: "var(--type-client)",
  project: "var(--type-project)",
  meeting: "var(--type-meeting)",
  idea: "var(--type-idea)",
};

export function NodeTypeChip({ type }: { type: string }) {
  const c = COLOR[type] ?? "var(--type-meeting)";
  return (
    <span
      style={{ color: c, borderColor: c }}
      className="rounded border px-1.5 py-0.5 text-xs font-medium capitalize"
    >
      {type}
    </span>
  );
}
