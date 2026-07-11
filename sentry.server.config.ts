// Sentry — server runtime init. Loaded by src/instrumentation.ts. No DSN → the
// SDK is disabled, so the app runs identically without Sentry configured.
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
  // Don't leak request bodies / headers by default.
  sendDefaultPii: false,
});
