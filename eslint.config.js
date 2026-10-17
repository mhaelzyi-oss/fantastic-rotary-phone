import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "dist-firefox", "site-dist", "node_modules", "test-results", "playwright-report", "public", "release", "web-tools/vendor/**"] },
  js.configs.recommended,
  { languageOptions: { globals: { ...globals.node, ...globals.browser } } },
  // Code that runs inside extension pages in the real-browser check.
  { files: ["scripts/real-browser.mjs"], languageOptions: { globals: { chrome: "readonly" } } },
  {
    files: ["web-tools/**/*.js"],
    languageOptions: {
      globals: {
        KuiMp4: "readonly",
        KuiUi: "readonly",
        KuiGif: "readonly",
        KuiCodecs: "readonly",
        MediaRecorder: "readonly",
        VideoEncoder: "readonly",
        VideoFrame: "readonly",
      },
    },
  },
  // Control characters are matched on purpose: they are what gets stripped from names and refused in commands.
  { rules: { "no-control-regex": "off" } },
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}", "harness/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  {
    // Tests and the harness are allowed to poke at internals.
    files: ["**/*.test.{ts,tsx}", "e2e/**", "harness/**"],
    rules: { "@typescript-eslint/no-explicit-any": "off", "@typescript-eslint/no-non-null-assertion": "off" },
  },
);
