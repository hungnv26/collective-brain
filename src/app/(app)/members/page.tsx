import { cookies } from "next/headers";
import { getMembership, getMyOrgs } from "@/lib/data/session";
import { listMembers, listPendingInvites } from "@/lib/data/members";
import { InviteForm } from "@/components/members/InviteForm";
import { InviteLink } from "@/components/members/InviteLink";

export const dynamic = "force-dynamic";

export default async function MembersPage() {
  const orgs = await getMyOrgs();
  const selected = (await cookies()).get("cb_org")?.value;
  const currentOrg = orgs.find((o) => o.id === selected) ?? orgs[0];

  const membership = await getMembership(currentOrg.id);
  const isAdmin = membership?.role === "owner" || membership?.role === "admin";

  const [members, invites] = await Promise.all([
    listMembers(currentOrg.id),
    isAdmin ? listPendingInvites(currentOrg.id) : Promise.resolve([]),
  ]);

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Members</h1>
      <p className="mt-1 text-sm text-muted">
        People in {currentOrg.name}.{" "}
        {isAdmin
          ? "Invite teammates by email — they join by opening the invite link."
          : "Only owners and admins can invite new members."}
      </p>

      {isAdmin && (
        <div className="mt-6">
          <InviteForm orgId={currentOrg.id} />
        </div>
      )}

      <section className="mt-8">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
          Members ({members.length})
        </h2>
        <ul className="divide-y divide-border rounded-xl border border-border bg-background">
          {members.map((m) => (
            <li key={m.user_id} className="flex items-center justify-between px-4 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm">{m.name || m.email || m.user_id}</p>
                {m.name && m.email && <p className="truncate text-xs text-muted">{m.email}</p>}
              </div>
              <span className="shrink-0 rounded bg-panel px-2 py-0.5 text-xs capitalize text-muted">
                {m.role}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {isAdmin && invites.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
            Pending invites ({invites.length})
          </h2>
          <ul className="space-y-3">
            {invites.map((inv) => (
              <li key={inv.id} className="rounded-xl border border-border bg-background p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm">{inv.email}</p>
                  <span className="rounded bg-panel px-2 py-0.5 text-xs capitalize text-muted">
                    {inv.role}
                  </span>
                </div>
                <div className="mt-2">
                  <InviteLink token={inv.token} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
