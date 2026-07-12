import { cookies } from "next/headers";
import { getMembership, getMyOrgs, getVisibleSpaces } from "@/lib/data/session";
import { listConnections } from "@/lib/data/connections";
import { connectorConfigured } from "@/lib/env";
import { ConnectionsManager } from "@/components/connections/ConnectionsManager";

export const dynamic = "force-dynamic";

export default async function ConnectionsPage() {
  const orgs = await getMyOrgs();
  const selected = (await cookies()).get("cb_org")?.value;
  const currentOrg = orgs.find((o) => o.id === selected) ?? orgs[0];

  const membership = await getMembership(currentOrg.id);
  const isAdmin = membership?.role === "owner" || membership?.role === "admin";

  const [connections, spaces] = await Promise.all([
    listConnections(currentOrg.id),
    getVisibleSpaces(currentOrg.id),
  ]);

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Connections</h1>
      <p className="mt-1 text-sm text-muted">
        Pull knowledge in from Slack and Gmail. New messages are distilled into nodes and land in
        your <a href="/review" className="underline">Review Queue</a> before anything is kept.
      </p>
      <div className="mt-6">
        <ConnectionsManager
          connections={connections}
          spaces={spaces}
          isAdmin={isAdmin}
          configured={{ slack: connectorConfigured("slack"), gmail: connectorConfigured("gmail") }}
        />
      </div>
    </div>
  );
}
