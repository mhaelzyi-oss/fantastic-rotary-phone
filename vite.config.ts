/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from "vite";
import { crx } from "@crxjs/vite-plugin";
import react from "@vitejs/plugin-react";
import { writeWebTools } from "./scripts/web-tools-pack.mjs";
import manifest from "./src/manifest";

function kuiWebToolsPlugin(): Plugin {
  return {
    name: "kui-web-tools",
    closeBundle() {
      writeWebTools("dist");
    },
  };
}

export default defineConfig({
  plugins: [react(), crx({ manifest }), kuiWebToolsPlugin()],
  publicDir: "public",
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/ui/test/setup.ts"],
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "site/**/*.test.ts", "web-tools/**/*.test.ts"],
    testTimeout: 15_000,
  },
});
