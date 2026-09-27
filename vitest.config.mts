import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

// `.env` is loaded so database-backed tests find DATABASE_URL locally; in CI the
// variables are already in the environment and `loadEnv` finds no file.
const env = loadEnv("test", process.cwd(), "");

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // next-auth imports "next/server" without the extension, which Node's ESM
      // resolver rejects outside Next's own bundler. Server modules under test
      // reach it through @/auth.
      "next/server": fileURLToPath(new URL("./node_modules/next/server.js", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    env,
    // next-auth is inlined so the "next/server" alias above applies to it;
    // externalised, Vite leaves its extensionless import to Node and it fails.
    server: { deps: { inline: ["next-auth", "@auth/core"] } },
  },
});
