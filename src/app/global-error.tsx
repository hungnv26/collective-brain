"use client";

// Catches errors thrown during React rendering of the root layout and reports
// them to Sentry (a no-op when Sentry isn't configured).
import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body className="flex min-h-screen items-center justify-center bg-panel px-4">
        <div className="w-full max-w-sm rounded-xl border border-border bg-background p-8 text-center shadow-sm">
          <h1 className="text-lg font-semibold tracking-tight">Something went wrong</h1>
          <p className="mt-2 text-sm text-muted">
            An unexpected error occurred. It&apos;s been logged — please try again.
          </p>
          <button
            onClick={() => window.location.assign("/")}
            className="mt-4 inline-block text-sm underline"
          >
            Back to safety
          </button>
        </div>
      </body>
    </html>
  );
}
