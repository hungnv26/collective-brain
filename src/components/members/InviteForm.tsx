"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { MembershipRole } from "@/lib/types";
import { InviteLink } from "./InviteLink";

// Roles an admin can grant here. `lead` has no privileges at beta (D2) and
// `owner` is set at org creation, so the useful beta choices are admin/member.
const ROLE_OPTIONS: { value: MembershipRole; label: string }[] = [
  { value: "member", label: "Member" },
  { value: "admin", label: "Admin" },
];

export function InviteForm({ orgId }: { orgId: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<MembershipRole>("member");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ email: string; token: string; emailed: boolean } | null>(
    null,
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setCreated(null);
    const res = await fetch("/api/invites", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ orgId, email, role }),
    });
    setBusy(false);
    if (res.ok) {
      const { invite, emailed } = await res.json();
      setCreated({ email, token: invite.token, emailed: Boolean(emailed) });
      setEmail("");
      router.refresh(); // surface it in the pending list too
    } else {
      const { error } = await res.json().catch(() => ({ error: "" }));
      setError(error || "Could not create the invite.");
    }
  }

  return (
    <div className="rounded-xl border border-border bg-background p-4">
      <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1">
          <label className="text-xs font-medium text-muted">Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="teammate@company.com"
            className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-zinc-400"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-muted">Role</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as MembershipRole)}
            className="mt-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm"
          >
            {ROLE_OPTIONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          disabled={busy || !email}
          className="rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Creating…" : "Create invite"}
        </button>
      </form>

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

      {created && (
        <div className="mt-3 rounded-md border border-border bg-panel p-3">
          <p className="text-xs text-muted">
            {created.emailed ? (
              <>
                Invite <strong>emailed</strong> to <strong>{created.email}</strong>. You can also
                share the link directly:
              </>
            ) : (
              <>
                Invite created for <strong>{created.email}</strong>. Send them this link — it&apos;s
                the only place it&apos;s shown:
              </>
            )}
          </p>
          <div className="mt-2">
            <InviteLink token={created.token} />
          </div>
        </div>
      )}
    </div>
  );
}
