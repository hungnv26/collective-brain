"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/** Redeems an invite token on mount, then sends the user into the app. */
export function AcceptInvite({ token }: { token: string }) {
  const router = useRouter();
  const [state, setState] = useState<"working" | "error">("working");
  const [message, setMessage] = useState("Joining your organisation…");
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return; // guard React StrictMode double-invoke
    ran.current = true;

    (async () => {
      const res = await fetch("/api/invites/accept", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (res.ok) {
        setMessage("You're in — taking you to your brain…");
        router.push("/");
        router.refresh();
      } else {
        const { error } = await res.json().catch(() => ({ error: "" }));
        setState("error");
        setMessage(
          /expired|revoked|not found|invalid/i.test(error ?? "")
            ? "This invite link is no longer valid. Ask an admin to send a new one."
            : "Could not accept this invite.",
        );
      }
    })();
  }, [token, router]);

  return (
    <div className="flex flex-1 items-center justify-center bg-panel px-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-background p-8 text-center shadow-sm">
        <h1 className="text-xl font-semibold tracking-tight">Collective Brain</h1>
        <p className={`mt-3 text-sm ${state === "error" ? "text-red-600" : "text-muted"}`}>
          {message}
        </p>
      </div>
    </div>
  );
}
