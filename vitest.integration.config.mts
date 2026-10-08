import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

// Real-database tests. Set CHAPEGA_IT_ADMIN_URL to a Postgres owner URL
// (SSL required, like Supabase); each run creates and drops its own database.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    include: ["tests/integration/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 180_000,
  },
});
