// Sentry — edge runtime init (proxy / middleware). Loaded by
// src/instrumentation.ts. No DSN → disabled.
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
  sendDefaultPii: false,
});
