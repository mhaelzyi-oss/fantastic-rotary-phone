/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import { crx } from "@crxjs/vite-plugin";
import react from "@vitejs/plugin-react";
import manifest from "./src/manifest";

export default defineConfig({
  plugins: [react(), crx({ manifest })],
  publicDir: "public",
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/ui/test/setup.ts"],
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "site/**/*.test.ts"],
    testTimeout: 15_000,
    fileParallelism: false,
  },
});
