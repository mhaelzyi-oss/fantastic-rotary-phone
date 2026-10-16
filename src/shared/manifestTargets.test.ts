import { describe, expect, it } from "vitest";
// @ts-expect-error plain script shared with the build
import { FIREFOX_ID, toFirefoxManifest } from "../../scripts/targets.mjs";

const chromium = {
  manifest_version: 3,
  name: "X",
  version: "1.0.0",
  side_panel: { default_path: "p.html" },
  permissions: ["downloads", "sidePanel", "storage"],
  background: { service_worker: "service-worker-loader.js", type: "module" },
  web_accessible_resources: [{ matches: ["https://*/*"], resources: ["a.js"], use_dynamic_url: false }],
  content_scripts: [{ matches: ["https://*/*"], js: ["h.js"], world: "MAIN", run_at: "document_start" }],
};

describe("toFirefoxManifest", () => {
  const ff = toFirefoxManifest(chromium);

  it("runs the background as an event page instead of a service worker", () => {
    expect(ff.background).toEqual({ scripts: ["service-worker-loader.js"], type: "module" });
  });

  it("removes what Firefox does not have, and nothing else", () => {
    expect(ff.side_panel).toBeUndefined();
    expect(ff.permissions).toEqual(["downloads", "storage"]);
    expect(ff.web_accessible_resources[0].use_dynamic_url).toBeUndefined();
    expect(ff.content_scripts).toEqual(chromium.content_scripts);
  });

  it("declares an id and says no data is collected", () => {
    expect(ff.browser_specific_settings.gecko.id).toBe(FIREFOX_ID);
    expect(ff.browser_specific_settings.gecko.data_collection_permissions).toEqual({ required: ["none"] });
  });

  it("does not change the input", () => {
    expect(chromium.side_panel).toBeDefined();
    expect(chromium.permissions).toContain("sidePanel");
  });
});
