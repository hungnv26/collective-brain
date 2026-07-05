"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { NODE_TYPES, type NodeStatus, type NodeType } from "@/lib/types";
import { NodeMarkdown } from "./NodeMarkdown";

const STATUSES: NodeStatus[] = ["draft", "reviewed", "stale", "archived"];

type Suggestion = { id: string; slug: string; title: string; type: string };

interface Props {
  orgId: string;
  mode: "create" | "edit";
  spaceId?: string; // create
  node?: {
    id: string;
    title: string;
    type: string;
    body_md: string;
    status: NodeStatus;
    confidence: string | null;
  };
}

export function NodeEditor({ orgId, mode, spaceId, node }: Props) {
  const router = useRouter();
  const [title, setTitle] = useState(node?.title ?? "");
  const [type, setType] = useState<NodeType>((node?.type as NodeType) ?? "fact");
  const [status, setStatus] = useState<NodeStatus>(node?.status ?? "draft");
  const [body, setBody] = useState(node?.body_md ?? "");
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // [[ autocomplete state
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [trigger, setTrigger] = useState<{ start: number; query: string } | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);

  useEffect(() => {
    if (!trigger) {
      setSuggestions([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/nodes?orgId=${orgId}&q=${encodeURIComponent(trigger.query)}`,
          { signal: ctrl.signal },
        );
        const json = await res.json();
        setSuggestions(json.nodes ?? []);
      } catch {
        /* aborted */
      }
    }, 120);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [trigger, orgId]);

  function onBodyChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const value = e.target.value;
    setBody(value);
    const caret = e.target.selectionStart ?? value.length;
    const before = value.slice(0, caret);
    const open = before.lastIndexOf("[[");
    if (open === -1) return setTrigger(null);
    const between = before.slice(open + 2);
    if (between.includes("]]") || between.includes("\n")) return setTrigger(null);
    setTrigger({ start: open, query: between.trim() });
  }

  function pick(s: Suggestion) {
    if (!trigger) return;
    const caret = textareaRef.current?.selectionStart ?? body.length;
    const next = body.slice(0, trigger.start) + `[[${s.slug}]]` + body.slice(caret);
    setBody(next);
    setTrigger(null);
    textareaRef.current?.focus();
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res =
        mode === "create"
          ? await fetch("/api/nodes", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ spaceId, type, title, body, status }),
            })
          : await fetch(`/api/nodes/${node!.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ title, body, status }),
            });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Save failed");
      const id = mode === "create" ? json.node.id : node!.id;
      router.push(`/nodes/${id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <div className="flex items-center gap-3">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Node title"
          className="flex-1 border-0 bg-transparent text-2xl font-semibold tracking-tight outline-none placeholder:text-muted"
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-1.5">
          <span className="text-muted">Type</span>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as NodeType)}
            disabled={mode === "edit"}
            className="rounded-md border border-border bg-background px-2 py-1 capitalize disabled:opacity-60"
          >
            {NODE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5">
          <span className="text-muted">Status</span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as NodeStatus)}
            className="rounded-md border border-border bg-background px-2 py-1 capitalize"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <button
          onClick={() => setPreview((v) => !v)}
          className="ml-auto rounded-md border border-border px-2 py-1 hover:bg-panel"
        >
          {preview ? "Edit" : "Preview"}
        </button>
      </div>

      <div className="relative mt-4">
        {preview ? (
          <div className="min-h-64 rounded-md border border-border bg-background p-4">
            <NodeMarkdown markdown={body || "_Nothing to preview yet._"} />
          </div>
        ) : (
          <textarea
            ref={textareaRef}
            value={body}
            onChange={onBodyChange}
            rows={16}
            placeholder="Write in markdown. Type [[ to link another node…"
            className="w-full resize-y rounded-md border border-border bg-background p-4 font-mono text-sm leading-relaxed outline-none focus:border-zinc-400"
          />
        )}

        {trigger && suggestions.length > 0 && !preview && (
          <ul className="absolute left-4 top-16 z-20 max-h-56 w-72 overflow-auto rounded-md border border-border bg-background shadow-lg">
            {suggestions.map((s) => (
              <li key={s.id}>
                <button
                  onClick={() => pick(s)}
                  className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm hover:bg-panel"
                >
                  <span className="truncate">{s.title}</span>
                  <span className="shrink-0 text-xs capitalize text-muted">{s.type}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <div className="mt-4 flex gap-2">
        <button
          onClick={save}
          disabled={busy || !title.trim()}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-white dark:text-zinc-900"
        >
          {busy ? "Saving…" : mode === "create" ? "Create node" : "Save changes"}
        </button>
        <button
          onClick={() => router.back()}
          className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-panel"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
