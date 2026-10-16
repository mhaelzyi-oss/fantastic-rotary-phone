import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { NECESSITY_TRACK } from "./track";

describe("necessity test track", () => {
  it("lists every required customizable addition", () => {
    expect(NECESSITY_TRACK.map((n) => n.id)).toEqual([
      "options-prefs",
      "download-path",
      "quality-cap",
      "host-lists",
      "scan-flags",
      "history-list",
      "filename-tokens",
      "hls-dash",
      "eta",
      "ui-worker-only",
      "stream-list-ui",
      "cli-commands",
      "cli-real-shells",
      "radar-layout",
      "radar-ui",
      "stream-names",
      "command-panel-ui",
      "trust-gate",
      "network-detect",
      "hls-engine",
      "hls-media",
      "job-recovery",
      "background-flow",
      "library",
      "diagnostics",
      "schema",
      "bandwidth",
      "network-order",
      "hostile-playlists",
      "retention",
      "firefox-manifest",
    ]);
  });

  it("points each item at a covering test file that exists", () => {
    for (const item of NECESSITY_TRACK) {
      expect(item.covers).toMatch(/src\/(shared|ui|background|content)\/.+\.test\.tsx?$/);
      expect(existsSync(resolve(process.cwd(), item.covers)), `${item.id} -> ${item.covers}`).toBe(true);
    }
  });
});
