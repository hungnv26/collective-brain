"use client";

import { useState } from "react";

/** Shows a join URL for an invite token with a one-click copy button. */
export function InviteLink({ token }: { token: string }) {
  const [copied, setCopied] = useState(false);
  // Rendered client-side, so window.location.origin is available.
  const url = typeof window !== "undefined" ? `${window.location.origin}/join?token=${token}` : `/join?token=${token}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — the field is selectable as a fallback */
    }
  }

  return (
    <div className="flex items-center gap-2">
      <input
        readOnly
        value={url}
        onFocus={(e) => e.currentTarget.select()}
        className="min-w-0 flex-1 truncate rounded-md border border-border bg-panel px-2 py-1 font-mono text-xs"
      />
      <button
        onClick={copy}
        className="shrink-0 rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-panel"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
