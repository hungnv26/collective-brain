import Link from "next/link";
import type { MembershipRole, Org, Space } from "@/lib/types";
import { OrgSwitcher } from "./OrgSwitcher";
import { SpaceTree } from "./SpaceTree";

const NAV: { label: string; icon: string; href?: string }[] = [
  { label: "Ask", icon: "✦", href: "/ask" },
  { label: "Dashboard", icon: "▦", href: "/" },
  { label: "Review Queue", icon: "☑", href: "/review" },
  { label: "Promotions", icon: "↑", href: "/promotions" },
  { label: "Graph", icon: "❖", href: "/graph" },
  { label: "Ingest", icon: "⤓", href: "/ingest" },
  { label: "Maintenance", icon: "⟳", href: "/maintenance" },
  { label: "Teams", icon: "⧉", href: "/teams" },
  { label: "Members", icon: "◎", href: "/members" },
];

export function Sidebar({
  orgs,
  currentOrg,
  spaces,
  role,
  reviewCount = 0,
}: {
  orgs: Org[];
  currentOrg: Org;
  spaces: Space[];
  role: MembershipRole;
  reviewCount?: number;
}) {
  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-border bg-background">
      <div className="border-b border-border p-3">
        <OrgSwitcher orgs={orgs} currentOrg={currentOrg} />
        <p className="mt-1 px-1 text-xs capitalize text-muted">{role}</p>
      </div>

      <div className="border-b border-border px-2 py-3">
        <ul className="space-y-0.5 text-sm">
          {NAV.map((item) =>
            item.href ? (
              <li key={item.label}>
                <Link
                  href={item.href}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-foreground hover:bg-panel"
                >
                  <span className="w-4 text-center">{item.icon}</span>
                  {item.label}
                  {item.label === "Review Queue" && reviewCount > 0 && (
                    <span className="ml-auto rounded-full bg-foreground px-1.5 text-xs font-medium tabular-nums text-background">
                      {reviewCount}
                    </span>
                  )}
                </Link>
              </li>
            ) : (
              <li key={item.label}>
                <span
                  title="Coming in a later sprint"
                  className="flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-muted/60"
                >
                  <span className="w-4 text-center">{item.icon}</span>
                  {item.label}
                </span>
              </li>
            ),
          )}
        </ul>
      </div>

      <div className="flex-1 overflow-auto">
        <SpaceTree spaces={spaces} />
      </div>
    </aside>
  );
}
