import { defineManifest } from "@crxjs/vite-plugin";

export default defineManifest({
  manifest_version: 3,
  name: "KUI Video Extractor",
  version: "1.2.0",
  options_page: "src/ui/options/index.html",
  description: "Extract the public video file from the page.",
  icons: {
    16: "icons/logo-idle-16.png",
    32: "icons/logo-idle-32.png",
    48: "icons/logo-idle-48.png",
    128: "icons/logo-idle-128.png",
  },
  side_panel: {
    default_path: "src/ui/sidepanel/index.html",
  },
  action: {
    default_popup: "src/ui/popup/index.html",
    default_title: "KUI Video Extractor",
    default_icon: {
      16: "icons/logo-idle-16.png",
      32: "icons/logo-idle-32.png",
      48: "icons/logo-idle-48.png",
    },
  },
  background: {
    service_worker: "src/background/index.ts",
    type: "module",
  },
  content_scripts: [
    {
      matches: ["http://*/*", "https://*/*"],
      js: ["src/content/hook.ts"],
      run_at: "document_start",
      all_frames: true,
      world: "MAIN",
    },
    {
      matches: ["http://*/*", "https://*/*"],
      js: ["src/content/index.ts"],
      run_at: "document_idle",
    },
  ],
  // Extension pages may only run bundled code: no remote scripts, no inline script, no plugins, no re-based URLs.
  content_security_policy: {
    extension_pages: "script-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  },
  permissions: ["activeTab", "alarms", "contextMenus", "downloads", "storage", "scripting", "notifications", "sidePanel"],
});
