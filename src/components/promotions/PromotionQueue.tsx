"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { PromotionListItem } from "@/lib/types";
import { NodeTypeChip } from "@/components/nodes/NodeTypeChip";

/** Approver/requester view of pending promotions, with inline act-on controls. */
export function PromotionQueue({ items }: { items: PromotionListItem[] }) {
  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-background p-8 text-center">
        <p className="text-sm font-medium">No promotions pending.</p>
        <p className="mt-1 text-sm text-muted">
          When someone requests moving a node into a team or org space, it&apos;ll appear here for
          approval.
        </p>
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {items.map((p) => (
        <PromotionCard key={p.id} p={p} />
      ))}
    </ul>
  );
}

function PromotionCard({ p }: { p: PromotionListItem }) {
  const router = useRouter();
  const [busy, setBusy] = useState<null | "approve" | "reject">(null);
  const [error, setError] = useState<string | null>(null);

  async function act(kind: "approve" | "reject") {
    setBusy(kind);
    setError(null);
    const res = await fetch(`/api/promotions/${p.id}/${kind}`, { method: "POST" });
    if (res.ok) {
      router.refresh();
    } else {
      setBusy(null);
      setError("Could not complete — you may not have access.");
    }
  }

  const preview = p.node_body_md.trim().slice(0, 240);

  return (
    <li className="rounded-xl border border-border bg-background p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <NodeTypeChip type={p.node_type} />
            <Link href={`/nodes/${p.node_id}`} className="truncate text-sm font-medium hover:underline">
              {p.node_title}
            </Link>
          </div>
          <p className="mt-1 text-xs text-muted">
            {p.from_name} <span aria-hidden>→</span> <span className="font-medium">{p.to_name}</span>
            {p.requester_email ? ` · requested by ${p.requester_email}` : ""}
          </p>
        </div>

        {p.can_approve ? (
          <div className="flex shrink-0 gap-2">
            <button
              onClick={() => act("approve")}
              disabled={busy !== null}
              className="rounded-md bg-foreground px-3 py-1 text-sm font-medium text-background hover:opacity-90 disabled:opacity-50"
            >
              {busy === "approve" ? "Approving…" : "Approve"}
            </button>
            <button
              onClick={() => act("reject")}
              disabled={busy !== null}
              className="rounded-md border border-border px-3 py-1 text-sm font-medium hover:bg-panel disabled:opacity-50"
            >
              {busy === "reject" ? "Rejecting…" : "Reject"}
            </button>
          </div>
        ) : (
          <span className="shrink-0 rounded bg-panel px-2 py-0.5 text-xs text-muted">Pending</span>
        )}
      </div>

      {preview && (
        <p className="mt-3 border-t border-border pt-3 text-sm text-muted">
          {preview}
          {p.node_body_md.length > 240 ? "…" : ""}
        </p>
      )}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </li>
  );
}
