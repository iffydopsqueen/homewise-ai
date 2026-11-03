import { defineConfig, devices } from "@playwright/test";

// Keep browsers inside the worktree so no global cache directory is
// required. Overridable: PLAYWRIGHT_BROWSERS_PATH=<path> npm run test:e2e
process.env.PLAYWRIGHT_BROWSERS_PATH ??= "./.playwright-browsers";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
