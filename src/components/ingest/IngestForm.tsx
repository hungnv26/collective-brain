"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Space } from "@/lib/types";

type Tab = "paste" | "url" | "file";

export function IngestForm({ spaces, defaultSpaceId }: { spaces: Space[]; defaultSpaceId?: string }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("paste");
  const [spaceId, setSpaceId] = useState(defaultSpaceId ?? spaces[0]?.id ?? "");
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [filename, setFilename] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFilename(file.name);
    setText(await file.text());
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const body =
        tab === "url"
          ? { spaceId, sourceKind: "url", url }
          : { spaceId, sourceKind: tab, text, filename };
      const res = await fetch("/api/ingest/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Ingest failed");
      router.push(`/ingest/${json.jobId}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ingest failed");
    } finally {
      setBusy(false);
    }
  }

  const canSubmit = spaceId && (tab === "url" ? url.trim() : text.trim());

  return (
    <div className="rounded-xl border border-border bg-background p-5">
      <label className="mb-3 block">
        <span className="mb-1 block text-sm font-medium">Target space</span>
        <select
          value={spaceId}
          onChange={(e) => setSpaceId(e.target.value)}
          className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
        >
          {spaces.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.kind})
            </option>
          ))}
        </select>
      </label>

      <div className="mb-3 flex gap-1 rounded-md border border-border p-1 text-sm">
        {(["paste", "url", "file"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 rounded px-2 py-1 capitalize ${
              tab === t ? "bg-panel font-medium" : "text-muted hover:text-foreground"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "paste" && (
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={10}
          placeholder="Paste a transcript, notes, or a document…"
          className="w-full rounded-md border border-border bg-background p-3 text-sm outline-none focus:border-zinc-400"
        />
      )}
      {tab === "url" && (
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com/article"
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-zinc-400"
        />
      )}
      {tab === "file" && (
        <div>
          <input ref={fileRef} type="file" accept=".txt,.md,.markdown,text/*" onChange={onFile} className="text-sm" />
          {filename && (
            <p className="mt-2 text-sm text-muted">
              {filename} — {text.length.toLocaleString()} chars ready
            </p>
          )}
        </div>
      )}

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <button
        onClick={submit}
        disabled={busy || !canSubmit}
        className="mt-4 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-white dark:text-zinc-900"
      >
        {busy ? "Distilling…" : "Distill into nodes"}
      </button>
      {busy && <p className="mt-2 text-xs text-muted">Claude is reading the source and proposing nodes — this can take a moment.</p>}
    </div>
  );
}
