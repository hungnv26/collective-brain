import Link from "next/link";
import { cookies } from "next/headers";
import { getMyOrgs, getVisibleSpaces } from "@/lib/data/session";
import { createClient } from "@/lib/supabase/server";
import { monthlyTokenCap, totalTokens, usageThisMonth } from "@/lib/usage/meter";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const orgs = await getMyOrgs();
  const selected = (await cookies()).get("cb_org")?.value;
  const currentOrg = orgs.find((o) => o.id === selected) ?? orgs[0];

  const supabase = await createClient();
  const [{ count: nodeCount }, spaces, usageRows] = await Promise.all([
    supabase.from("nodes").select("*", { count: "exact", head: true }).eq("org_id", currentOrg.id),
    getVisibleSpaces(currentOrg.id),
    usageThisMonth(supabase, currentOrg.id),
  ]);
  const usedTokens = totalTokens(usageRows);
  const cap = monthlyTokenCap();
  const usedPct = Math.min(100, Math.round((usedTokens / cap) * 100));

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">{currentOrg.name}</h1>
      <p className="mt-1 text-sm text-muted">Your company&apos;s memory, organised and answerable.</p>

      {/* Ask — front and centre */}
      <Link
        href="/ask"
        className="mt-6 flex items-center gap-2 rounded-xl border border-border bg-background p-4 shadow-sm hover:border-zinc-400"
      >
        <span className="text-muted">✦</span>
        <span className="flex-1 text-sm text-muted">Ask your organisation anything…</span>
        <span className="rounded bg-panel px-2 py-0.5 text-xs text-muted">Cited answers</span>
      </Link>

      <div className="mt-6 grid grid-cols-2 gap-4">
        <Stat label="Knowledge nodes" value={nodeCount ?? 0} />
        <Stat label="Spaces you can see" value={spaces.length} />
      </div>

      <div className="mt-4 rounded-xl border border-border bg-background p-4">
        <div className="flex items-baseline justify-between">
          <p className="text-sm text-muted">AI usage this month</p>
          <p className="text-sm tabular-nums">
            {usedTokens.toLocaleString()}{" "}
            <span className="text-muted">/ {cap.toLocaleString()} tokens</span>
          </p>
        </div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-panel">
          <div
            className={`h-full rounded-full ${usedPct >= 100 ? "bg-red-500" : "bg-foreground"}`}
            style={{ width: `${usedPct}%` }}
          />
        </div>
      </div>

      {(nodeCount ?? 0) === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-border bg-background p-8 text-center">
          <p className="text-sm font-medium">Your brain is empty — for now.</p>
          <p className="mt-1 text-sm text-muted">
            <Link href="/ingest" className="underline">
              Ingest
            </Link>{" "}
            a document or transcript to distill it into knowledge nodes, or add a note in a space —
            then ask questions and get cited answers.
          </p>
        </div>
      ) : (
        <div className="mt-6 flex flex-wrap gap-2 text-sm">
          <Link
            href="/ingest"
            className="rounded-md border border-border px-3 py-1.5 font-medium hover:bg-panel"
          >
            Ingest more
          </Link>
          <Link
            href="/graph"
            className="rounded-md border border-border px-3 py-1.5 font-medium hover:bg-panel"
          >
            Explore the graph
          </Link>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-background p-4">
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      <p className="mt-1 text-sm text-muted">{label}</p>
    </div>
  );
}
