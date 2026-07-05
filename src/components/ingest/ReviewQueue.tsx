"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { NodeTypeChip } from "@/components/nodes/NodeTypeChip";
import { NodeMarkdown } from "@/components/nodes/NodeMarkdown";
import type { ReviewItem } from "@/lib/types";

export function ReviewQueue({ jobId, items }: { jobId: string; items: ReviewItem[] }) {
  const router = useRouter();
  const [queue, setQueue] = useState(items);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ title: string; body_md: string }>({ title: "", body_md: "" });

  function remove(id: string) {
    setQueue((q) => q.filter((it) => it.id !== id));
  }

  async function accept(item: ReviewItem, overrides?: object) {
    setBusy(item.id);
    const res = await fetch(`/api/review-items/${item.id}/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ overrides: overrides ?? {} }),
    });
    setBusy(null);
    if (res.ok) {
      remove(item.id);
      setEditing(null);
      router.refresh();
    } else {
      alert("Could not accept — you may not have write access.");
    }
  }

  async function reject(item: ReviewItem) {
    setBusy(item.id);
    const res = await fetch(`/api/review-items/${item.id}/reject`, { method: "POST" });
    setBusy(null);
    if (res.ok) {
      remove(item.id);
      router.refresh();
    }
  }

  async function bulkAccept() {
    setBusy("bulk");
    const res = await fetch("/api/review-items/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId, minConfidence: "high" }),
    });
    setBusy(null);
    if (res.ok) {
      const { accepted } = await res.json();
      setQueue((q) => q.filter((it) => it.proposed.confidence !== "high").slice());
      router.refresh();
      if (!accepted) alert("No high-confidence items to accept.");
    }
  }

  if (queue.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-background p-10 text-center">
        <p className="text-sm font-medium">Queue clear 🎉</p>
        <p className="mt-1 text-sm text-muted">All proposed nodes have been reviewed.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-muted">{queue.length} pending</p>
        <button
          onClick={bulkAccept}
          disabled={busy === "bulk"}
          className="rounded-md border border-border px-2 py-1 text-sm font-medium hover:bg-panel disabled:opacity-50"
        >
          {busy === "bulk" ? "Accepting…" : "Accept all high-confidence"}
        </button>
      </div>

      <div className="space-y-3">
        {queue.map((item) => {
          const p = item.proposed;
          const isEditing = editing === item.id;
          return (
            <div key={item.id} className="rounded-xl border border-border bg-background p-4">
              <div className="mb-2 flex items-center gap-2">
                <NodeTypeChip type={p.type} />
                <span className="text-xs text-muted">confidence: {p.confidence}</span>
              </div>

              {isEditing ? (
                <div className="space-y-2">
                  <input
                    value={draft.title}
                    onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                    className="w-full rounded-md border border-border bg-background px-2 py-1 text-lg font-semibold outline-none"
                  />
                  <textarea
                    value={draft.body_md}
                    onChange={(e) => setDraft((d) => ({ ...d, body_md: e.target.value }))}
                    rows={5}
                    className="w-full rounded-md border border-border bg-background p-2 font-mono text-sm outline-none"
                  />
                </div>
              ) : (
                <>
                  <h3 className="text-lg font-semibold tracking-tight">{p.title}</h3>
                  <div className="mt-1">
                    <NodeMarkdown markdown={p.body_md} />
                  </div>
                </>
              )}

              {item.dup_candidates.length > 0 && (
                <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-2 text-sm text-amber-800">
                  Possible duplicate of{" "}
                  {item.dup_candidates.map((d, i) => (
                    <span key={d.node_id}>
                      {i > 0 && ", "}
                      <Link href={`/nodes/${d.node_id}`} className="font-medium underline">
                        {d.title || "a node"}
                      </Link>{" "}
                      ({Math.round(d.score * 100)}%)
                    </span>
                  ))}
                </div>
              )}

              <div className="mt-3 flex gap-2">
                {isEditing ? (
                  <>
                    <button
                      onClick={() => accept(item, { title: draft.title, body_md: draft.body_md })}
                      disabled={busy === item.id}
                      className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-white dark:text-zinc-900"
                    >
                      Save &amp; accept
                    </button>
                    <button onClick={() => setEditing(null)} className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-panel">
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => accept(item)}
                      disabled={busy === item.id}
                      className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-white dark:text-zinc-900"
                    >
                      {busy === item.id ? "…" : "Accept"}
                    </button>
                    <button
                      onClick={() => {
                        setEditing(item.id);
                        setDraft({ title: p.title, body_md: p.body_md });
                      }}
                      className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-panel"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => reject(item)}
                      disabled={busy === item.id}
                      className="rounded-md px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
