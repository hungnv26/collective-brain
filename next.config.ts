import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  // Pin the workspace root to this project (a stray lockfile in the parent dir
  // otherwise confuses Turbopack's root inference).
  turbopack: { root: __dirname },
};

// withSentryConfig adds source-map upload + tunneling. With no SENTRY_AUTH_TOKEN
// / org / project it skips upload and just leaves runtime instrumentation — so
// the build still works with Sentry unconfigured.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  widenClientFileUpload: true,
});
