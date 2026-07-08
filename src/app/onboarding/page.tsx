"use client";

// D1 (gstack eng review): the full multi-step onboarding wizard (invite team,
// first ingest, first ask) is DEFERRED to post-beta — concierge onboarding
// makes it moot. Beta ships the minimal step: create an org. Invites happen
// later via the (deferred) admin UI; the /api/invites endpoint already exists.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { slugify } from "@/lib/validation/schemas";

export default function OnboardingPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function createOrg(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/orgs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, slug: slug || slugify(name) }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not create org");
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center bg-panel px-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-background p-8 shadow-sm">
        <form onSubmit={createOrg} className="space-y-4">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Create your organisation</h1>
            <p className="mt-1 text-sm text-muted">
              You can invite teammates and set up spaces once it&apos;s created.
            </p>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Name</label>
            <input
              required
              autoFocus
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (!slugTouched) setSlug(slugify(e.target.value));
              }}
              placeholder="Lewis & Bollards"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-zinc-400"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Slug</label>
            <input
              required
              value={slug}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(slugify(e.target.value));
              }}
              placeholder="lewis-bollards"
              className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-sm outline-none focus:border-zinc-400"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-white dark:text-zinc-900"
          >
            {busy ? "Creating…" : "Create organisation"}
          </button>
        </form>
      </div>
    </div>
  );
}
