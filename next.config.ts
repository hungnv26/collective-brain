import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root to this project (a stray lockfile in the parent dir
  // otherwise confuses Turbopack's root inference).
  turbopack: { root: __dirname },
};

export default nextConfig;
