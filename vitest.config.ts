import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    testTimeout: 30_000, // PGlite cold-starts a WASM Postgres per suite
    hookTimeout: 30_000,
  },
});
