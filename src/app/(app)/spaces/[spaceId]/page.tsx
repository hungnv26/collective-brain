import Link from "next/link";
import { notFound } from "next/navigation";
import { getSpace, listSpaceNodes } from "@/lib/data/nodes";
import { NodeTypeChip } from "@/components/nodes/NodeTypeChip";

export const dynamic = "force-dynamic";

const KIND_LABEL = { private: "Private", team: "Team", org: "Org" } as const;

export default async function SpacePage({ params }: { params: Promise<{ spaceId: string }> }) {
  const { spaceId } = await params;
  const space = await getSpace(spaceId);
  if (!space) notFound();
  const nodes = await listSpaceNodes(spaceId);

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted">{KIND_LABEL[space.kind]} space</p>
          <h1 className="text-2xl font-semibold tracking-tight">{space.name}</h1>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={`/api/export?space=${space.id}`}
            className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-panel"
          >
            Export
          </a>
          <Link
            href={`/spaces/${space.id}/new`}
            className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-white dark:text-zinc-900"
          >
            + New node
          </Link>
        </div>
      </div>

      <div className="mt-6 space-y-2">
        {nodes.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-background p-10 text-center text-sm text-muted">
            No nodes yet. Create the first one.
          </div>
        ) : (
          nodes.map((n) => (
            <Link
              key={n.id}
              href={`/nodes/${n.id}`}
              className="flex items-center gap-3 rounded-lg border border-border bg-background px-4 py-3 hover:border-zinc-400"
            >
              <NodeTypeChip type={n.type} />
              <span className="flex-1 truncate font-medium">{n.title}</span>
              <span className="shrink-0 text-xs capitalize text-muted">{n.status}</span>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
