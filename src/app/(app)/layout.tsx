import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { requireUser, getMyOrgs, getMembership, getVisibleSpaces } from "@/lib/data/session";
import { Sidebar } from "@/components/app-shell/Sidebar";
import { TopBar } from "@/components/app-shell/TopBar";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const orgs = await getMyOrgs();
  if (orgs.length === 0) redirect("/onboarding");

  // Current org: cookie-selected if valid, else most recent.
  const selected = (await cookies()).get("cb_org")?.value;
  const currentOrg = orgs.find((o) => o.id === selected) ?? orgs[0];

  const [spaces, membership] = await Promise.all([
    getVisibleSpaces(currentOrg.id),
    getMembership(currentOrg.id),
  ]);

  return (
    <div className="flex h-screen w-full overflow-hidden">
      <Sidebar orgs={orgs} currentOrg={currentOrg} spaces={spaces} role={membership?.role ?? "member"} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar email={user.email ?? ""} />
        <main className="flex-1 overflow-auto bg-panel">{children}</main>
      </div>
    </div>
  );
}
