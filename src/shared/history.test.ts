import { describe, expect, it } from "vitest";
import { filterHistory, withSubfolder } from "./history";

describe("withSubfolder", () => {
  it("prefixes a safe Downloads subfolder", () => {
    expect(withSubfolder("clip.mp4", "GoldenWebSave")).toBe("GoldenWebSave/clip.mp4");
  });

  it("skips an empty folder", () => {
    expect(withSubfolder("clip.mp4", "")).toBe("clip.mp4");
  });
});

describe("filterHistory", () => {
  const items = [
    { title: "Northern Lights", filename: "lights_1080p.mp4", url: "https://cdn.example/a.mp4", quality: "1080p" },
    { title: "Talk", filename: "talk.webm", url: "https://vimeo.com/1", quality: "720p" },
  ];

  it("filters the download list by title, file, url, or quality", () => {
    expect(filterHistory(items, "1080")).toHaveLength(1);
    expect(filterHistory(items, "vimeo")).toHaveLength(1);
    expect(filterHistory(items, "")).toHaveLength(2);
  });
});
