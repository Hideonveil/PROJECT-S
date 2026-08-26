import { defineConfig } from "@playwright/test";

const external = process.env.E2E_BASE_URL;
const standaloneServer = "node scripts/start-standalone-test.mjs";
const standalonePort = 4310;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  use: {
    baseURL: external || `http://127.0.0.1:${standalonePort}`,
    locale: "zh-CN",
    trace: "retain-on-failure",
  },
  webServer: external ? undefined : {
    command: standaloneServer,
    url: `http://127.0.0.1:${standalonePort}/index.html`,
    env: {
      ...process.env,
      // Mirror the production standalone server. Binding to a loopback
      // hostname makes Next reject the browser's Host header as a 400 before
      // any product code or mock API has a chance to run.
      HOSTNAME: "0.0.0.0",
      PORT: String(standalonePort),
      NODE_ENV: "production",
      // This suite replaces API and Supabase responses at the browser layer.
      // Do not boot a real background matcher with fake credentials.
      MATCHMAKING_SWEEP_DISABLED: "true",
    },
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
