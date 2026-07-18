import Link from "next/link";
import { cookies } from "next/headers";
import { getMyOrgs, getVisibleSpaces } from "@/lib/data/session";
import { createClient } from "@/lib/supabase/server";
import {
  monthlyCostCap,
  monthlyTokenCap,
  totalCost,
  totalTokens,
  usageThisMonth,
  type UsageRow,
} from "@/lib/usage/meter";
import { providerLabel, type ProviderId } from "@/lib/ai/provider";

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
  const usedCost = totalCost(usageRows);
  const costCap = monthlyCostCap();
  const rows = usageRows as UsageRow[];
  const byProvider = aggregateByProvider(rows);

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
            <span className="ml-2 text-muted">·</span>{" "}
            <span title="Estimated spend across all providers">
              ${usedCost.toFixed(2)}
              {costCap > 0 && <span className="text-muted"> / ${costCap.toLocaleString()}</span>}
            </span>
          </p>
        </div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-panel">
          <div
            className={`h-full rounded-full ${usedPct >= 100 ? "bg-red-500" : "bg-foreground"}`}
            style={{ width: `${usedPct}%` }}
          />
        </div>

        {byProvider.length > 0 && (
          <table className="mt-4 w-full text-xs">
            <thead>
              <tr className="text-left text-muted">
                <th className="pb-1 font-medium">Provider</th>
                <th className="pb-1 text-right font-medium">Calls</th>
                <th className="pb-1 text-right font-medium">Tokens</th>
                <th className="pb-1 text-right font-medium">Cost</th>
              </tr>
            </thead>
            <tbody>
              {byProvider.map((p) => (
                <tr key={p.provider} className="border-t border-border">
                  <td className="py-1">{providerLabel(p.provider as ProviderId)}</td>
                  <td className="py-1 text-right tabular-nums">{p.calls.toLocaleString()}</td>
                  <td className="py-1 text-right tabular-nums">{p.tokens.toLocaleString()}</td>
                  <td className="py-1 text-right tabular-nums">${p.cost.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
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

interface ProviderTotals {
  provider: string;
  calls: number;
  tokens: number;
  cost: number;
}

/** Collapse the kind×provider×model rollup into per-provider totals, costliest first. */
function aggregateByProvider(rows: UsageRow[]): ProviderTotals[] {
  const map = new Map<string, ProviderTotals>();
  for (const r of rows) {
    const key = r.provider || "unknown";
    const acc = map.get(key) ?? { provider: key, calls: 0, tokens: 0, cost: 0 };
    acc.calls += Number(r.calls);
    acc.tokens += Number(r.input_tokens) + Number(r.output_tokens);
    acc.cost += Number(r.cost_usd);
    map.set(key, acc);
  }
  return [...map.values()].sort((a, b) => b.cost - a.cost);
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-background p-4">
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      <p className="mt-1 text-sm text-muted">{label}</p>
    </div>
  );
}
