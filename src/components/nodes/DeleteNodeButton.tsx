"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function DeleteNodeButton({ id, spaceId }: { id: string; spaceId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function del() {
    if (!confirm("Delete this node? This cannot be undone.")) return;
    setBusy(true);
    const res = await fetch(`/api/nodes/${id}`, { method: "DELETE" });
    if (res.ok) {
      router.push(`/spaces/${spaceId}`);
      router.refresh();
    } else {
      setBusy(false);
      alert("Could not delete — you may not have write access.");
    }
  }

  return (
    <button
      onClick={del}
      disabled={busy}
      className="rounded-md px-2 py-1 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
    >
      {busy ? "Deleting…" : "Delete"}
    </button>
  );
}
