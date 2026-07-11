// Sentry — browser init. Next.js loads this early on the client. No DSN →
// disabled, so nothing is sent and there's no runtime cost beyond the import.
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  tracesSampleRate: Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
  sendDefaultPii: false,
});

// Instruments App Router client navigations for tracing.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
