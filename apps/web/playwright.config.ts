import { defineConfig } from "@playwright/test";

const skipWebServer = process.env.PLAYWRIGHT_SKIP_WEB_SERVER === "1";

export default defineConfig({
  testDir: "./tests/e2e",
  use: {
    // Must be :3000 — the API's FRONTEND_URL allows CORS only from there, and
    // :3002 belongs to the WhatsApp gateway.
    baseURL: "http://localhost:3000",
  },
  webServer: skipWebServer
    ? undefined
    : {
        command: "pnpm exec next dev --hostname 127.0.0.1 --port 3000",
        port: 3000,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
