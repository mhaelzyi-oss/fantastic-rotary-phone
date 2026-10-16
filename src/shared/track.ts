/**
 * Product necessities and the unit tests that track them.
 * Keep `covers` in sync when adding behavior.
 */
export const NECESSITY_TRACK = [
  { id: "options-prefs", title: "Persisted options (folder, quality cap, scan, hosts, badge)", covers: "src/shared/prefs.test.ts" },
  { id: "download-path", title: "Downloads subfolder + save path", covers: "src/shared/history.test.ts" },
  { id: "quality-cap", title: "Default quality with max height cap", covers: "src/shared/quality.test.ts" },
  { id: "host-lists", title: "Site allow/block lists", covers: "src/shared/hosts.test.ts" },
  { id: "scan-flags", title: "Scan depth flags (hidden / scripts / iframes)", covers: "src/shared/prefs.test.ts" },
  { id: "history-list", title: "History search list", covers: "src/shared/history.test.ts" },
  { id: "filename-tokens", title: "Filename tokens including host/index/ext", covers: "src/shared/filename.test.ts" },
  { id: "hls-dash", title: "HLS/DASH playlist parsing", covers: "src/shared/parseHls.test.ts" },
  { id: "eta", title: "Download ETA", covers: "src/shared/eta.test.ts" },
  { id: "ui-worker-only", title: "UI talks to worker only (no fetch / no hls.js)", covers: "src/ui/lib/ui-network.test.ts" },
  { id: "stream-list-ui", title: "React stream list with expand-for-details", covers: "src/ui/components/StreamList.test.tsx" },
  { id: "cli-commands", title: "Extraction commands: 7 tools x 3 shells, injection-safe, never for DRM", covers: "src/shared/cli.test.ts" },
  { id: "cli-real-shells", title: "Commands round-trip through real PowerShell / cmd.exe / bash", covers: "src/shared/cli.shell.test.ts" },
  { id: "radar-layout", title: "Download radar blip layout is deterministic and spaced", covers: "src/ui/lib/radar.test.ts" },
  { id: "radar-ui", title: "Download radar component (blips, locked state, picking)", covers: "src/ui/components/Radar.test.tsx" },
  { id: "stream-names", title: "Streams on one page get distinguishable names", covers: "src/ui/lib/streamName.test.ts" },
  { id: "command-panel-ui", title: "Command panel (tool/shell pickers, copy, DRM refusal)", covers: "src/ui/components/CommandPanel.test.tsx" },
  { id: "trust-gate", title: "Background re-checks every download request (http(s) only, detected URL, DRM refused)", covers: "src/shared/trust.test.ts" },
  { id: "network-detect", title: "Media found by response type and resource timeline, segments excluded", covers: "src/shared/url.test.ts" },
  { id: "hls-engine", title: "HLS joined in the page: variants, ranges, retries, refuses encrypted/live/empty", covers: "src/content/hlsDownload.test.ts" },
  { id: "hls-media", title: "HLS media playlist parsing (segments, maps, keys, endlist)", covers: "src/shared/hlsMedia.test.ts" },
  { id: "job-recovery", title: "Queue survives a service-worker restart; stalled and orphaned jobs settle", covers: "src/shared/jobs.test.ts" },
  { id: "background-flow", title: "Real background modules: start, page engine hand-off, retry, tab close, restart", covers: "src/background/background.test.ts" },
  { id: "library", title: "Saved sources with tags, notes and search", covers: "src/shared/library.test.ts" },
  { id: "diagnostics", title: "Diagnostics log redacts addresses and tokens", covers: "src/shared/diagnostics.test.ts" },
  { id: "schema", title: "Stored data migrates between versions", covers: "src/shared/schema.test.ts" },
  { id: "bandwidth", title: "Smoothed speed for ETA", covers: "src/shared/bandwidth.test.ts" },
  { id: "network-order", title: "Streams fetched before the content script starts are still found", covers: "src/content/network.test.ts" },
  { id: "hostile-playlists", title: "Hostile HLS playlists never fetch non-http(s) addresses", covers: "src/content/hlsDownload.test.ts" },
  { id: "retention", title: "Finished jobs, history and log expire after 30 days", covers: "src/shared/retention.test.ts" },
  { id: "firefox-manifest", title: "Firefox manifest is a rewrite of the Chromium one, not a second product", covers: "src/shared/manifestTargets.test.ts" },
] as const;

export type NecessityId = (typeof NECESSITY_TRACK)[number]["id"];
