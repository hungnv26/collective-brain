"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Org } from "@/lib/types";

/** Sets the cb_org cookie and reloads so the server layout picks the new org. */
export function OrgSwitcher({ orgs, currentOrg }: { orgs: Org[]; currentOrg: Org }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  function select(id: string) {
    document.cookie = `cb_org=${id}; path=/; max-age=${60 * 60 * 24 * 365}`;
    setOpen(false);
    router.refresh();
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-md border border-border bg-background px-2 py-1.5 text-sm font-medium hover:bg-panel"
      >
        <span className="truncate">{currentOrg.name}</span>
        <span className="text-muted">▾</span>
      </button>
      {open && (
        <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border border-border bg-background shadow-md">
          {orgs.map((o) => (
            <li key={o.id}>
              <button
                onClick={() => select(o.id)}
                className={`block w-full px-3 py-2 text-left text-sm hover:bg-panel ${
                  o.id === currentOrg.id ? "font-semibold" : ""
                }`}
              >
                {o.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
