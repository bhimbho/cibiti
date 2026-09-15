import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root so lockfiles elsewhere on the machine are ignored.
  turbopack: { root: import.meta.dirname },
};

export default nextConfig;
