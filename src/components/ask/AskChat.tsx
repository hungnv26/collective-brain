"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { NodeMarkdown } from "@/components/nodes/NodeMarkdown";
import type { Citation, Message } from "@/lib/types";

interface ChatMessage extends Message {
  sources?: Citation[]; // full retrieved set, for resolving inline [n] chips
  streaming?: boolean;
}

export function AskChat({
  initialMessages,
  conversationId: initialConversationId,
}: {
  initialMessages: Message[];
  conversationId?: string;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [panel, setPanel] = useState<{ id: string; title: string; body_md: string; type: string } | null>(null);
  const convId = useRef(initialConversationId);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function openNode(id: string) {
    setPanel({ id, title: "Loading…", body_md: "", type: "fact" });
    const res = await fetch(`/api/nodes/${id}`);
    if (res.ok) {
      const { node } = await res.json();
      setPanel(node);
    }
  }

  async function send() {
    const question = input.trim();
    if (!question || busy) return;
    setInput("");
    setBusy(true);
    setMessages((m) => [
      ...m,
      { id: `u-${Date.now()}`, role: "user", content: question, citations: [], feedback: null },
      { id: "streaming", role: "assistant", content: "", citations: [], feedback: null, streaming: true },
    ]);

    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: convId.current, question }),
      });
      if (!res.ok || !res.body) throw new Error((await res.json().catch(() => ({}))).error ?? "Ask failed");

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let answered = true;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf("\n\n")) >= 0) {
          const line = buf.slice(0, i);
          buf = buf.slice(i + 2);
          if (!line.startsWith("data: ")) continue;
          const evt = JSON.parse(line.slice(6));
          if (evt.type === "meta") {
            convId.current = evt.conversationId;
            const sources: Citation[] = evt.sources.map((s: { n: number; id: string; title: string }) => ({
              n: s.n,
              node_id: s.id,
              title: s.title,
            }));
            setMessages((m) => patchStreaming(m, (a) => ({ ...a, sources })));
          } else if (evt.type === "delta") {
            setMessages((m) => patchStreaming(m, (a) => ({ ...a, content: a.content + evt.text })));
          } else if (evt.type === "done") {
            answered = evt.answered;
            setMessages((m) =>
              patchStreaming(m, (a) => ({
                ...a,
                id: evt.messageId ?? a.id,
                citations: evt.citations ?? [],
                streaming: false,
              })),
            );
          } else if (evt.type === "error") {
            throw new Error(evt.error);
          }
        }
      }
      if (!answered) {
        // knowledge gap already logged server-side; surface it
        setMessages((m) =>
          patchStreaming(m, (a) => ({ ...a, streaming: false })),
        );
      }
      router.refresh(); // refresh the conversation sidebar
    } catch (err) {
      setMessages((m) =>
        patchStreaming(m, (a) => ({
          ...a,
          content: a.content || `⚠️ ${err instanceof Error ? err.message : "Ask failed"}`,
          streaming: false,
        })),
      );
    } finally {
      setBusy(false);
    }
  }

  async function feedback(id: string, value: "up" | "down") {
    setMessages((m) => m.map((x) => (x.id === id ? { ...x, feedback: value } : x)));
    await fetch(`/api/messages/${id}/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ feedback: value }),
    });
  }

  return (
    <div className="flex h-full">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex-1 overflow-auto px-6 py-6">
          <div className="mx-auto max-w-2xl space-y-5">
            {messages.length === 0 && (
              <p className="mt-20 text-center text-sm text-muted">
                Ask your organisation anything. Answers cite the nodes they came from.
              </p>
            )}
            {messages.map((m) => (
              <div key={m.id} className={m.role === "user" ? "text-right" : ""}>
                {m.role === "user" ? (
                  <span className="inline-block rounded-2xl bg-zinc-900 px-4 py-2 text-sm text-white dark:bg-white dark:text-zinc-900">
                    {m.content}
                  </span>
                ) : (
                  <div className="rounded-xl border border-border bg-background p-4">
                    <div className="text-sm leading-relaxed">
                      {m.content ? (
                        <AnswerText text={m.content} sources={m.sources ?? m.citations} onCite={openNode} />
                      ) : (
                        <span className="text-muted">Thinking…</span>
                      )}
                    </div>
                    {!m.streaming && m.content && (
                      <div className="mt-3 flex items-center gap-2 border-t border-border pt-2 text-muted">
                        <button onClick={() => feedback(m.id, "up")} className={`text-sm ${m.feedback === "up" ? "text-emerald-600" : "hover:text-foreground"}`}>
                          ▲
                        </button>
                        <button onClick={() => feedback(m.id, "down")} className={`text-sm ${m.feedback === "down" ? "text-red-600" : "hover:text-foreground"}`}>
                          ▼
                        </button>
                        {m.citations.length > 0 && (
                          <span className="ml-2 text-xs">
                            {m.citations.length} source{m.citations.length === 1 ? "" : "s"}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        </div>

        <div className="border-t border-border bg-background p-4">
          <div className="mx-auto flex max-w-2xl gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder="Ask a question…"
              disabled={busy}
              className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-zinc-400"
            />
            <button
              onClick={send}
              disabled={busy || !input.trim()}
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-white dark:text-zinc-900"
            >
              {busy ? "…" : "Ask"}
            </button>
          </div>
        </div>
      </div>

      {panel && (
        <aside className="flex w-80 shrink-0 flex-col border-l border-border bg-background">
          <div className="flex items-center justify-between border-b border-border p-3">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">Source</span>
            <button onClick={() => setPanel(null)} className="text-sm text-muted hover:text-foreground">
              ✕
            </button>
          </div>
          <div className="flex-1 overflow-auto p-4">
            <h3 className="text-lg font-semibold tracking-tight">{panel.title}</h3>
            <div className="mt-2">
              <NodeMarkdown markdown={panel.body_md} />
            </div>
            <Link href={`/nodes/${panel.id}`} className="mt-4 inline-block text-sm text-[var(--type-fact)] hover:underline">
              Open node →
            </Link>
          </div>
        </aside>
      )}
    </div>
  );
}

function patchStreaming(messages: ChatMessage[], fn: (a: ChatMessage) => ChatMessage): ChatMessage[] {
  return messages.map((m) => (m.streaming ? fn(m) : m));
}

/** Render answer text, turning [n] tokens into clickable citation chips. */
function AnswerText({
  text,
  sources,
  onCite,
}: {
  text: string;
  sources: Citation[];
  onCite: (nodeId: string) => void;
}) {
  const byN = new Map(sources.map((s) => [s.n, s]));
  const parts = text.split(/(\[\d+\])/g);
  return (
    <span>
      {parts.map((part, i) => {
        const match = part.match(/^\[(\d+)\]$/);
        if (match) {
          const src = byN.get(Number(match[1]));
          if (src) {
            return (
              <button
                key={i}
                onClick={() => onCite(src.node_id)}
                title={src.title}
                className="mx-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded bg-[var(--type-fact)] px-1 align-super text-[10px] font-semibold text-white hover:opacity-80"
              >
                {match[1]}
              </button>
            );
          }
        }
        return <Fragment key={i}>{part}</Fragment>;
      })}
    </span>
  );
}
