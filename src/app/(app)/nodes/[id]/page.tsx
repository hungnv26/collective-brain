import Link from "next/link";
import { notFound } from "next/navigation";
import { getBacklinks, getNode, getVersions, resolveWikilinkMap } from "@/lib/data/nodes";
import { renderWikilinksToMarkdown } from "@/lib/nodes/wikilinks";
import { NodeMarkdown } from "@/components/nodes/NodeMarkdown";
import { NodeTypeChip } from "@/components/nodes/NodeTypeChip";
import { DeleteNodeButton } from "@/components/nodes/DeleteNodeButton";

export const dynamic = "force-dynamic";

const fmt = (iso: string) => new Date(iso).toLocaleDateString();

export default async function NodePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const node = await getNode(id);
  if (!node) notFound();

  const [backlinks, versions, map] = await Promise.all([
    getBacklinks(id),
    getVersions(id),
    resolveWikilinkMap(node.org_id, node.body_md),
  ]);
  const markdown = renderWikilinksToMarkdown(node.body_md, (slug) => map.get(slug) ?? null);

  return (
    <div className="mx-auto flex max-w-5xl gap-8 px-6 py-8">
      <article className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <NodeTypeChip type={node.type} />
          <span className="text-xs capitalize text-muted">{node.status}</span>
          {node.confidence && (
            <span className="text-xs text-muted">· confidence: {node.confidence}</span>
          )}
        </div>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">{node.title}</h1>
        <p className="mt-1 text-xs text-muted">
          Created {fmt(node.created_at)} · Updated {fmt(node.updated_at)}
        </p>

        <div className="mt-3 flex gap-2">
          <Link
            href={`/nodes/${node.id}/edit`}
            className="rounded-md border border-border px-2 py-1 text-sm font-medium hover:bg-panel"
          >
            Edit
          </Link>
          <DeleteNodeButton id={node.id} spaceId={node.space_id} />
        </div>

        <div className="mt-6 border-t border-border pt-6">
          {node.body_md.trim() ? (
            <NodeMarkdown markdown={markdown} />
          ) : (
            <p className="text-sm text-muted">This node has no content yet.</p>
          )}
        </div>
      </article>

      <aside className="hidden w-64 shrink-0 space-y-6 lg:block">
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
            Backlinks ({backlinks.length})
          </h2>
          {backlinks.length === 0 ? (
            <p className="text-sm text-muted/70">Nothing links here yet.</p>
          ) : (
            <ul className="space-y-1">
              {backlinks.map((b) => (
                <li key={b.id}>
                  <Link href={`/nodes/${b.id}`} className="flex items-center gap-2 text-sm hover:underline">
                    <NodeTypeChip type={b.type} />
                    <span className="truncate">{b.title}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
            History ({versions.length})
          </h2>
          <ul className="space-y-1 text-sm text-muted">
            {versions.map((v, i) => (
              <li key={v.id}>
                v{versions.length - i} · {fmt(v.created_at)}
              </li>
            ))}
          </ul>
        </section>
      </aside>
    </div>
  );
}
