"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Team } from "@/lib/data/teams";
import type { Member } from "@/lib/data/members";

export function TeamsManager({
  initialTeams,
  orgMembers,
  isAdmin,
}: {
  initialTeams: Team[];
  orgMembers: Member[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function post(url: string, body?: object, method = "POST") {
    setError(null);
    const res = await fetch(url, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.ok) {
      router.refresh();
      return true;
    }
    const { error } = await res.json().catch(() => ({ error: "" }));
    setError(error || "Something went wrong.");
    return false;
  }

  async function createTeam(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const ok = await post("/api/teams", { name });
    setBusy(false);
    if (ok) setName("");
  }

  return (
    <div className="space-y-6">
      {error && <p className="text-sm text-red-600">{error}</p>}

      {isAdmin && (
        <form onSubmit={createTeam} className="flex gap-2 rounded-xl border border-border bg-background p-4">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="New team name"
            className="min-w-0 flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-zinc-400"
          />
          <button
            type="submit"
            disabled={busy || name.trim().length < 2}
            className="rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background hover:opacity-90 disabled:opacity-50"
          >
            Create team
          </button>
        </form>
      )}

      {initialTeams.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-background p-8 text-center">
          <p className="text-sm font-medium">No teams yet.</p>
          <p className="mt-1 text-sm text-muted">
            {isAdmin
              ? "Create a team, add members, then give it a shared space."
              : "An owner or admin can create teams here."}
          </p>
        </div>
      ) : (
        initialTeams.map((team) => (
          <TeamCard key={team.id} team={team} orgMembers={orgMembers} isAdmin={isAdmin} onMutate={post} />
        ))
      )}
    </div>
  );
}

function TeamCard({
  team,
  orgMembers,
  isAdmin,
  onMutate,
}: {
  team: Team;
  orgMembers: Member[];
  isAdmin: boolean;
  onMutate: (url: string, body?: object, method?: string) => Promise<boolean>;
}) {
  const onTeam = new Set(team.members.map((m) => m.user_id));
  const candidates = orgMembers.filter((m) => !onTeam.has(m.user_id));
  const [addId, setAddId] = useState("");
  const [spaceName, setSpaceName] = useState("");

  return (
    <div className="rounded-xl border border-border bg-background p-4">
      <h2 className="text-sm font-semibold">{team.name}</h2>

      {/* Members */}
      <div className="mt-3">
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">
          Members ({team.members.length})
        </p>
        {team.members.length === 0 ? (
          <p className="text-sm text-muted/70">No members yet.</p>
        ) : (
          <ul className="space-y-1">
            {team.members.map((m) => (
              <li key={m.user_id} className="flex items-center gap-2 text-sm">
                <span className="truncate">{m.email ?? m.user_id}</span>
                {m.is_lead && (
                  <span className="rounded bg-panel px-1.5 py-0.5 text-xs text-muted">lead</span>
                )}
                {isAdmin && (
                  <button
                    onClick={() => onMutate(`/api/teams/${team.id}/members/${m.user_id}`, undefined, "DELETE")}
                    className="ml-auto text-xs text-red-600 hover:underline"
                  >
                    remove
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        {isAdmin && candidates.length > 0 && (
          <div className="mt-2 flex gap-2">
            <select
              value={addId}
              onChange={(e) => setAddId(e.target.value)}
              className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 text-sm"
            >
              <option value="">Add a member…</option>
              {candidates.map((c) => (
                <option key={c.user_id} value={c.user_id}>
                  {c.email ?? c.user_id}
                </option>
              ))}
            </select>
            <button
              onClick={async () => {
                if (addId && (await onMutate(`/api/teams/${team.id}/members`, { userId: addId }))) setAddId("");
              }}
              disabled={!addId}
              className="rounded-md border border-border px-3 py-1 text-sm font-medium hover:bg-panel disabled:opacity-50"
            >
              Add
            </button>
          </div>
        )}
      </div>

      {/* Spaces */}
      <div className="mt-4 border-t border-border pt-3">
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">
          Spaces ({team.spaces.length})
        </p>
        {team.spaces.length === 0 ? (
          <p className="text-sm text-muted/70">No team space yet.</p>
        ) : (
          <ul className="space-y-1">
            {team.spaces.map((s) => (
              <li key={s.id}>
                <Link href={`/spaces/${s.id}`} className="text-sm hover:underline">
                  {s.name}
                </Link>
              </li>
            ))}
          </ul>
        )}

        {isAdmin && (
          <div className="mt-2 flex gap-2">
            <input
              value={spaceName}
              onChange={(e) => setSpaceName(e.target.value)}
              placeholder="New team space name"
              className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 text-sm outline-none focus:border-zinc-400"
            />
            <button
              onClick={async () => {
                if (spaceName.trim().length >= 2 && (await onMutate(`/api/teams/${team.id}/spaces`, { name: spaceName })))
                  setSpaceName("");
              }}
              disabled={spaceName.trim().length < 2}
              className="rounded-md border border-border px-3 py-1 text-sm font-medium hover:bg-panel disabled:opacity-50"
            >
              Add space
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
