import { cookies } from "next/headers";
import { getMyOrgs } from "@/lib/data/session";
import { listPromotions } from "@/lib/data/promotions";
import { PromotionQueue } from "@/components/promotions/PromotionQueue";

export const dynamic = "force-dynamic";

export default async function PromotionsPage() {
  const orgs = await getMyOrgs();
  const selected = (await cookies()).get("cb_org")?.value;
  const currentOrg = orgs.find((o) => o.id === selected) ?? orgs[0];

  const items = await listPromotions(currentOrg.id);

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Promotions</h1>
      <p className="mt-1 text-sm text-muted">
        Requests to move a node into a team or org space. Approving moves the node; at beta,
        approval is limited to owners and admins.
      </p>
      <div className="mt-6">
        <PromotionQueue items={items} />
      </div>
    </div>
  );
}
