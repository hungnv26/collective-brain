"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type PromoteTarget = { id: string; name: string; kind: string };

/**
 * Requests promotion of a node into a more-visible space. Approval is a
 * separate step (owner/admin, on /promotions), so this only files the request.
 */
export function PromoteButton({
  nodeId,
  targets,
}: {
  nodeId: string;
  targets: PromoteTarget[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [toSpaceId, setToSpaceId] = useState(targets[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  if (targets.length === 0) return null;

  async function submit() {
    setBusy(true);
    setMsg(null);
    const res = await fetch(`/api/nodes/${nodeId}/promote`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ toSpaceId }),
    });
    setBusy(false);
    if (res.ok) {
      setOpen(false);
      setMsg("Promotion requested — pending approval.");
      router.refresh();
    } else {
      const { error } = await res.json().catch(() => ({ error: "" }));
      setMsg(/already pending/.test(error ?? "") ? "Already pending approval." : "Could not request promotion.");
    }
  }

  return (
    <div className="relative inline-block">
      <button
        onClick={() => setOpen((v) => !v)}
        className="rounded-md border border-border px-2 py-1 text-sm font-medium hover:bg-panel"
      >
        Promote ↑
      </button>

      {open && (
        <div className="absolute z-10 mt-1 w-64 rounded-md border border-border bg-background p-3 shadow-md">
          <label className="text-xs font-medium text-muted">Promote to</label>
          <select
            value={toSpaceId}
            onChange={(e) => setToSpaceId(e.target.value)}
            className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
          >
            {targets.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.kind})
              </option>
            ))}
          </select>
          <button
            onClick={submit}
            disabled={busy || !toSpaceId}
            className="mt-2 w-full rounded-md bg-foreground px-2 py-1.5 text-sm font-medium text-background hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Requesting…" : "Request promotion"}
          </button>
        </div>
      )}

      {msg && <p className="mt-1 text-xs text-muted">{msg}</p>}
    </div>
  );
}
