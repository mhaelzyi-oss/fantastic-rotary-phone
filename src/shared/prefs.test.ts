import { describe, expect, it } from "vitest";
import { DEFAULT_PREFS } from "./types";
import { mergePrefs, parseHostList } from "./prefs";

describe("mergePrefs", () => {
  it("fills scan flags and download defaults for old stored objects", () => {
    const merged = mergePrefs({ prompt: "{title}.mp4", preferredQuality: "720" });
    expect(merged.prompt).toBe("{title}.mp4");
    expect(merged.subfolder).toBe("GoldenWebSave");
    expect(merged.saveAs).toBe(false);
    expect(merged.scan).toEqual({ hidden: true, scripts: true, iframes: true });
    expect(merged.showBadge).toBe(true);
    expect(merged.maxHeight).toBe("auto");
    expect(merged.allowHosts).toEqual([]);
  });

  it("keeps explicit scan flags", () => {
    expect(mergePrefs({ scan: { hidden: false, scripts: false, iframes: true } }).scan).toEqual({
      hidden: false,
      scripts: false,
      iframes: true,
    });
  });

  it("returns full defaults for empty input", () => {
    expect(mergePrefs()).toMatchObject(DEFAULT_PREFS);
  });
});

describe("parseHostList", () => {
  it("splits commas and strips www", () => {
    expect(parseHostList("www.Example.com, vimeo.com")).toEqual(["example.com", "vimeo.com"]);
  });
});
