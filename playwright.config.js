import { defineConfig, devices } from "@playwright/test";

// Build reporter array - only include Bug0 Studio reporter for studio runs
const reporters = [["html"], ["json", { outputFile: "reports/result.json" }]];

if (process.env.projectId) {
  reporters.push(["./bug0-studio-reporter.ts"]);
}

export default defineConfig({
  timeout: 5 * 60 * 1000, // 5 minutes per test
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 10 : undefined,
  reporter: reporters,
  use: {
    trace: "on-first-retry",
    video: "on",
  },
  projects: [
    {
      name: "Login test",
      testMatch: "login-suite.spec.ts"
    },
    {
      name: "User flow tests",
      use: { ...devices["Desktop Chrome"], channel: "chromium", storageState: "storage/auth.json" },
      dependencies: ["Login test"],
      testIgnore: ["login-suite.spec.ts", "cleanup.spec.ts"],
      teardown: "Cleanup test",
    },
    {
      name: "Cleanup test",
      use: { ...devices["Desktop Chrome"], channel: "chromium", storageState: "storage/auth.json" },
      testMatch: "cleanup.spec.ts"
    }
  ],
});
