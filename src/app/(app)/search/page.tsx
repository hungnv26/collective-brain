import Link from "next/link";
import { cookies } from "next/headers";
import { getMyOrgs } from "@/lib/data/session";
import { searchNodes } from "@/lib/data/nodes";
import { NodeTypeChip } from "@/components/nodes/NodeTypeChip";
import type { Node } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = (q ?? "").trim();

  const orgs = await getMyOrgs();
  const selected = (await cookies()).get("cb_org")?.value;
  const org = orgs.find((o) => o.id === selected) ?? orgs[0];

  const results = query && org ? await searchNodes(org.id, query) : [];

  // group by type, preserving rank order
  const byType = new Map<string, Node[]>();
  for (const n of results) {
    (byType.get(n.type) ?? byType.set(n.type, []).get(n.type)!).push(n);
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <form action="/search" className="mb-6">
        <input
          name="q"
          defaultValue={query}
          placeholder="Search everything…"
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-zinc-400"
        />
      </form>

      {!query ? (
        <p className="text-sm text-muted">Type a query above to search your organisation&apos;s knowledge.</p>
      ) : results.length === 0 ? (
        <p className="text-sm text-muted">
          No results for <strong>{query}</strong>. It may not be in the brain yet.
        </p>
      ) : (
        <div className="space-y-6">
          <p className="text-sm text-muted">
            {results.length} result{results.length === 1 ? "" : "s"} for <strong>{query}</strong>
          </p>
          {[...byType.entries()].map(([type, nodes]) => (
            <section key={type}>
              <h2 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted">
                <NodeTypeChip type={type} /> {nodes.length}
              </h2>
              <ul className="space-y-2">
                {nodes.map((n) => (
                  <li key={n.id}>
                    <Link
                      href={`/nodes/${n.id}`}
                      className="block rounded-lg border border-border bg-background px-4 py-3 hover:border-zinc-400"
                    >
                      <p className="font-medium">{n.title}</p>
                      {n.body_md && (
                        <p className="mt-0.5 line-clamp-1 text-sm text-muted">{n.body_md}</p>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
