import { cookies } from "next/headers";
import { getMembership, getMyOrgs } from "@/lib/data/session";
import { listTeams } from "@/lib/data/teams";
import { listMembers } from "@/lib/data/members";
import { TeamsManager } from "@/components/teams/TeamsManager";

export const dynamic = "force-dynamic";

export default async function TeamsPage() {
  const orgs = await getMyOrgs();
  const selected = (await cookies()).get("cb_org")?.value;
  const currentOrg = orgs.find((o) => o.id === selected) ?? orgs[0];

  const membership = await getMembership(currentOrg.id);
  const isAdmin = membership?.role === "owner" || membership?.role === "admin";

  const [teams, members] = await Promise.all([
    listTeams(currentOrg.id),
    listMembers(currentOrg.id),
  ]);

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Teams</h1>
      <p className="mt-1 text-sm text-muted">
        Group members and give them a shared space inside {currentOrg.name}.{" "}
        {isAdmin
          ? "At beta, team spaces are writable by owners and admins."
          : "Only owners and admins can manage teams."}
      </p>
      <div className="mt-6">
        <TeamsManager initialTeams={teams} orgMembers={members} isAdmin={isAdmin} />
      </div>
    </div>
  );
}
