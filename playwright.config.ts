import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  workers: 1,
  webServer: [
    {
      command: "npx vite --config vite.demo.config.ts --host 127.0.0.1",
      url: "http://127.0.0.1:4177",
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: "npx vite --config vite.harness.config.ts --host 127.0.0.1",
      url: "http://127.0.0.1:4178",
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
  use: {
    baseURL: "http://127.0.0.1:4177",
    channel: process.env.PW_CHANNEL ?? "msedge",
  },
});
