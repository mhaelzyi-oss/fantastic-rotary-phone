// Turns the Chromium build's manifest into the one each other browser needs.

/** Change this to an address you control before publishing to addons.mozilla.org. It is only an identifier. */
export const FIREFOX_ID = "kui-video-extractor@krypton-inc.example";
export const FIREFOX_MIN_VERSION = "140.0";

export function toFirefoxManifest(chromium) {
  const m = structuredClone(chromium);
  // Firefox runs the background as an event page (a script), not a service worker.
  const worker = m.background?.service_worker;
  m.background = { scripts: worker ? [worker] : [], type: "module" };
  // No side panel API in Firefox.
  delete m.side_panel;
  m.permissions = (m.permissions ?? []).filter((p) => p !== "sidePanel");
  // Chromium-only key.
  for (const war of m.web_accessible_resources ?? []) delete war.use_dynamic_url;
  m.browser_specific_settings = {
    gecko: {
      id: FIREFOX_ID,
      strict_min_version: FIREFOX_MIN_VERSION,
      // The extension collects and transmits nothing. Mozilla asks every new extension to say so.
      data_collection_permissions: { required: ["none"] },
    },
  };
  return m;
}
