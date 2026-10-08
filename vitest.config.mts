import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    include: ["tests/unit/**/*.test.ts"],
    clearMocks: true,
    restoreMocks: true,
    coverage: {
      provider: "v8",
      include: ["app/**", "components/**", "domain/**", "server/**", "store/**"],
      exclude: ["**/*.d.ts", "**/*.css", ".next/**"],
      reporter: ["text-summary", "json-summary", "lcov"],
      reportsDirectory: "coverage",
      // Ratchet: set to the current suite level (rounded down) so regressions
      // fail CI. Raise these as coverage improves; never lower them.
      thresholds: {
        statements: 33,
        branches: 29,
        functions: 32,
        lines: 34,
      },
    },
  },
});
