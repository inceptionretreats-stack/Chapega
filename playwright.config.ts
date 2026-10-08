import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.PORT ?? 3100);
const baseURL = `http://localhost:${port}`;
const testDataDirectory = path.join(
  process.cwd(),
  ".data",
  `e2e-${process.pid}`,
);

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  // The local JSON adapter is intentionally single-process and the scenarios
  // mutate shared catalogue/order state, so E2E files must not overlap.
  workers: 1,
  reporter: "list",
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: `npm run dev -- --hostname localhost --port ${port}`,
    env: {
      CHAPEGA_DATA_BACKEND: "local",
      CHAPEGA_DATA_DIR: testDataDirectory,
      ALLOW_VENDOR_PREVIEW_LOGIN: "true",
      VENDOR_EMAIL: "owner@chapega.com",
      VENDOR_PASSWORD: "Chapega@2026",
      // The specs read VENDOR_NAME from the same environment, so CI's value
      // must reach the server instead of being overridden here.
      VENDOR_NAME: process.env.VENDOR_NAME ?? "Aanya",
      NEXT_PUBLIC_SUPABASE_URL: "",
    },
    url: baseURL,
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
