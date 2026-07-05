"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { slugify } from "@/lib/validation/schemas";

type Step = "org" | "invite";

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("org");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [invites, setInvites] = useState("");
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
      setOrgId(json.org.id);
      setStep("invite");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function sendInvites() {
    setBusy(true);
    setError(null);
    const emails = invites
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    try {
      for (const email of emails) {
        await fetch("/api/invites", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orgId, email, role: "member" }),
        });
      }
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center bg-panel px-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-background p-8 shadow-sm">
        <ol className="mb-6 flex items-center gap-2 text-xs font-medium text-muted">
          <li className={step === "org" ? "text-foreground" : ""}>1. Create org</li>
          <span>→</span>
          <li className={step === "invite" ? "text-foreground" : ""}>2. Invite team</li>
        </ol>

        {step === "org" && (
          <form onSubmit={createOrg} className="space-y-4">
            <h1 className="text-lg font-semibold tracking-tight">Create your organisation</h1>
            <div>
              <label className="mb-1 block text-sm font-medium">Name</label>
              <input
                required
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
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-white dark:text-zinc-900"
            >
              {busy ? "Creating…" : "Create organisation"}
            </button>
          </form>
        )}

        {step === "invite" && (
          <div className="space-y-4">
            <h1 className="text-lg font-semibold tracking-tight">Invite your team</h1>
            <p className="text-sm text-muted">
              Add teammate emails (comma or space separated). You can skip and do this later.
            </p>
            <textarea
              value={invites}
              onChange={(e) => setInvites(e.target.value)}
              rows={3}
              placeholder="chi@firm.com, an@firm.com"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-zinc-400"
            />
            <div className="flex gap-2">
              <button
                onClick={() => router.push("/")}
                className="flex-1 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-panel"
              >
                Skip
              </button>
              <button
                onClick={sendInvites}
                disabled={busy}
                className="flex-1 rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-white dark:text-zinc-900"
              >
                {busy ? "Sending…" : "Send & continue"}
              </button>
            </div>
          </div>
        )}

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </div>
    </div>
  );
}
