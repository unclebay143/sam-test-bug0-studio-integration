import {
  createAzurePlaywrightConfig,
  ServiceOS,
  ServiceAuth,
} from "@azure/playwright";
import { defineConfig } from "@playwright/test";
import config from "./playwright.config";

// Build reporter array - only include Bug0 Studio reporter for studio runs
const reporters = [
  ["html"],
  ["list"],
  ["json", { outputFile: "reports/result.json" }],
  ["./realtime-reporter.ts"],
];

if (process.env.projectId) {
  reporters.push(["./bug0-studio-reporter.ts"]);
}

export default defineConfig(
  config,
  createAzurePlaywrightConfig(config, {
    exposeNetwork: "<loopback>",
    connectTimeout: 3 * 60 * 1000, // 3 minutes
    os: ServiceOS.LINUX,
    serviceAuthType: ServiceAuth.ACCESS_TOKEN,
  }),
  {
    reporter: reporters,
  }
);
