import { cookies } from "next/headers";
import { getMembership, getMyOrgs } from "@/lib/data/session";
import { latestRuns } from "@/lib/data/agents";
import { MaintenancePanel } from "@/components/agents/MaintenancePanel";
import type { AgentName } from "@/lib/agents/report";

export const dynamic = "force-dynamic";

export default async function MaintenancePage() {
  const orgs = await getMyOrgs();
  const selected = (await cookies()).get("cb_org")?.value;
  const currentOrg = orgs.find((o) => o.id === selected) ?? orgs[0];

  const membership = await getMembership(currentOrg.id);
  const isAdmin = membership?.role === "owner" || membership?.role === "admin";

  const runs = await latestRuns(currentOrg.id);
  const initial: Partial<Record<AgentName, { report: Record<string, unknown>; created_at: string }>> = {};
  for (const [agent, run] of Object.entries(runs)) {
    if (run) initial[agent as AgentName] = { report: run.report, created_at: run.created_at };
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Maintenance</h1>
      <p className="mt-1 text-sm text-muted">
        Agents that keep {currentOrg.name} healthy.{" "}
        {isAdmin ? "Run one to refresh its report." : "Only owners and admins can run these."}
      </p>
      <div className="mt-6">
        <MaintenancePanel initial={initial} isAdmin={isAdmin} />
      </div>
    </div>
  );
}
