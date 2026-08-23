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
      HOSTNAME: "127.0.0.1",
      PORT: String(standalonePort),
      NODE_ENV: "production",
    },
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
