import { cookies } from "next/headers";
import { getMyOrgs } from "@/lib/data/session";
import { getOrgGraph } from "@/lib/data/graph";
import { GraphView } from "@/components/graph/GraphView";

export const dynamic = "force-dynamic";

export default async function GraphPage() {
  const orgs = await getMyOrgs();
  const selected = (await cookies()).get("cb_org")?.value;
  const currentOrg = orgs.find((o) => o.id === selected) ?? orgs[0];

  const data = await getOrgGraph(currentOrg.id);

  return (
    <div className="h-full bg-background">
      <GraphView data={data} />
    </div>
  );
}
