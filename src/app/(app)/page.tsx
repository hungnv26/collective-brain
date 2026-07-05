import { cookies } from "next/headers";
import { getMyOrgs, getVisibleSpaces } from "@/lib/data/session";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const orgs = await getMyOrgs();
  const selected = (await cookies()).get("cb_org")?.value;
  const currentOrg = orgs.find((o) => o.id === selected) ?? orgs[0];

  const supabase = await createClient();
  const [{ count: nodeCount }, spaces] = await Promise.all([
    supabase.from("nodes").select("*", { count: "exact", head: true }).eq("org_id", currentOrg.id),
    getVisibleSpaces(currentOrg.id),
  ]);

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">{currentOrg.name}</h1>
      <p className="mt-1 text-sm text-muted">Your company&apos;s memory, organised and answerable.</p>

      {/* Ask — front and centre (wired up in Sprint 4) */}
      <div className="mt-6 rounded-xl border border-border bg-background p-4 shadow-sm">
        <div className="flex items-center gap-2">
          <span className="text-muted">✦</span>
          <input
            placeholder="Ask your organisation anything…"
            disabled
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted"
          />
          <span className="rounded bg-panel px-2 py-0.5 text-xs text-muted">Coming in Sprint 4</span>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4">
        <Stat label="Knowledge nodes" value={nodeCount ?? 0} />
        <Stat label="Spaces you can see" value={spaces.length} />
      </div>

      <div className="mt-6 rounded-xl border border-dashed border-border bg-background p-8 text-center">
        <p className="text-sm font-medium">Your brain is empty — for now.</p>
        <p className="mt-1 text-sm text-muted">
          Node editing lands in Sprint 2 and ingestion in Sprint 3. The foundation
          (auth, orgs, spaces, and airtight permissions) is in place.
        </p>
      </div>
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
