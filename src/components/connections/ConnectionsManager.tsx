"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Space } from "@/lib/types";
import type { ConnectionRow } from "@/lib/data/connections";
import { PROVIDER_LABEL, type Provider } from "@/lib/connectors/types";

const CONFIG_HINT: Record<string, { label: string; placeholder: string; key: string }> = {
  slack: { label: "Channels", placeholder: "C0123ABC, C0456DEF", key: "channels" },
  gmail: { label: "Gmail label", placeholder: "brain", key: "label" },
  telegram: { label: "Chat IDs", placeholder: "-1001234567890", key: "chatIds" },
};

export function ConnectionsManager({
  connections,
  spaces,
  isAdmin,
  configured,
}: {
  connections: ConnectionRow[];
  spaces: Space[];
  isAdmin: boolean;
  configured: Record<"slack" | "gmail", boolean>;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function patch(id: string, body: object) {
    setError(null);
    const res = await fetch(`/api/connections/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) router.refresh();
    else setError("Could not save — you may not have access.");
  }

  async function remove(id: string) {
    if (!confirm("Remove this connection? Already-ingested nodes stay.")) return;
    const res = await fetch(`/api/connections/${id}`, { method: "DELETE" });
    if (res.ok) router.refresh();
    else setError("Could not remove.");
  }

  return (
    <div className="space-y-6">
      {error && <p className="text-sm text-red-600">{error}</p>}

      {isAdmin && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {(["slack", "gmail"] as const).map((p) =>
              configured[p] ? (
                <a
                  key={p}
                  href={`/api/connectors/${p}/authorize`}
                  className="rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background hover:opacity-90"
                >
                  Connect {PROVIDER_LABEL[p]}
                </a>
              ) : (
                <span
                  key={p}
                  title={`Set ${p === "slack" ? "SLACK_CLIENT_ID/SECRET" : "GOOGLE_CLIENT_ID/SECRET"} to enable`}
                  className="rounded-md border border-dashed border-border px-3 py-1.5 text-sm text-muted/60"
                >
                  {PROVIDER_LABEL[p]} — not configured
                </span>
              ),
            )}
            <TelegramConnect onDone={() => router.refresh()} onError={setError} />
          </div>
          <p className="text-xs text-muted">
            WhatsApp &amp; Instagram have no API for group chats — export the chat and upload the{" "}
            <code className="rounded bg-panel px-1">.txt</code> on the{" "}
            <Link href="/ingest" className="underline">Ingest</Link> page. CB auto-detects WhatsApp exports.
          </p>
        </div>
      )}

      {connections.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-background p-8 text-center">
          <p className="text-sm font-medium">No channels connected.</p>
          <p className="mt-1 text-sm text-muted">
            {isAdmin
              ? "Connect Slack or Gmail above, then choose which space its knowledge lands in."
              : "An owner or admin can connect channels here."}
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {connections.map((c) => (
            <ConnectionCard
              key={c.id}
              conn={c}
              spaces={spaces}
              isAdmin={isAdmin}
              onPatch={patch}
              onRemove={remove}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function TelegramConnect({
  onDone,
  onError,
}: {
  onDone: () => void;
  onError: (m: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);

  async function connect() {
    setBusy(true);
    onError(null);
    const res = await fetch("/api/connectors/telegram/connect", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    });
    setBusy(false);
    if (res.ok) {
      setToken("");
      setOpen(false);
      onDone();
    } else {
      const { error } = await res.json().catch(() => ({ error: "" }));
      onError(error || "Could not connect Telegram.");
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background hover:opacity-90"
      >
        Connect Telegram
      </button>
    );
  }
  return (
    <span className="inline-flex items-center gap-2">
      <input
        value={token}
        onChange={(e) => setToken(e.target.value)}
        placeholder="Bot token from @BotFather"
        className="w-56 rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-zinc-400"
      />
      <button
        onClick={connect}
        disabled={busy || token.trim().length < 20}
        className="rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background hover:opacity-90 disabled:opacity-50"
      >
        {busy ? "Checking…" : "Connect"}
      </button>
    </span>
  );
}

function ConnectionCard({
  conn,
  spaces,
  isAdmin,
  onPatch,
  onRemove,
}: {
  conn: ConnectionRow;
  spaces: Space[];
  isAdmin: boolean;
  onPatch: (id: string, body: object) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  const hint = CONFIG_HINT[conn.provider];
  const currentConfig = (conn.config?.[hint.key] as string[] | string | undefined) ?? "";
  const [cfg, setCfg] = useState(Array.isArray(currentConfig) ? currentConfig.join(", ") : String(currentConfig));

  const statusColor =
    conn.status === "error" ? "text-red-600" : conn.status === "paused" ? "text-muted" : "text-emerald-600";

  function saveConfig() {
    const value =
      hint.key === "channels"
        ? cfg.split(",").map((s) => s.trim()).filter(Boolean)
        : cfg.trim();
    onPatch(conn.id, { config: { ...conn.config, [hint.key]: value } });
  }

  return (
    <li className="rounded-xl border border-border bg-background p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-medium">{PROVIDER_LABEL[conn.provider as Provider]}</span>
          <span className={`text-xs capitalize ${statusColor}`}>· {conn.status}</span>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-3">
            <button
              onClick={() => onPatch(conn.id, { status: conn.status === "paused" ? "active" : "paused" })}
              className="text-xs text-muted hover:underline"
            >
              {conn.status === "paused" ? "Resume" : "Pause"}
            </button>
            <button onClick={() => onRemove(conn.id)} className="text-xs text-red-600 hover:underline">
              Remove
            </button>
          </div>
        )}
      </div>

      {conn.last_error && <p className="mt-1 text-xs text-red-600">Last error: {conn.last_error}</p>}
      {conn.last_synced_at && (
        <p className="mt-1 text-xs text-muted/70">Last synced {new Date(conn.last_synced_at).toLocaleString()}</p>
      )}

      {isAdmin && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-muted">
            Target space
            <select
              value={conn.target_space_id ?? ""}
              onChange={(e) => onPatch(conn.id, { target_space_id: e.target.value || null })}
              className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
            >
              <option value="">— pick a space —</option>
              {spaces.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-muted">
            {hint.label}
            <div className="mt-1 flex gap-2">
              <input
                value={cfg}
                onChange={(e) => setCfg(e.target.value)}
                placeholder={hint.placeholder}
                className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm"
              />
              <button
                onClick={saveConfig}
                className="rounded-md border border-border px-3 text-sm font-medium hover:bg-panel"
              >
                Save
              </button>
            </div>
          </label>
        </div>
      )}
    </li>
  );
}
