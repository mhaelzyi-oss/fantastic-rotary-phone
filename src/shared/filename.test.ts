import { describe, expect, it } from "vitest";
import { formatFilename, formatYmd, lintFilenameTemplate } from "./filename";

describe("formatFilename", () => {
  const now = new Date("2026-09-06T12:00:00Z");

  it("uses the default {title}_{host}_{YYYYMMDD}_{quality}.mp4 pattern", () => {
    expect(
      formatFilename({ title: "Flower Demo", quality: "1080p", now, host: "example.com" }),
    ).toBe("Flower_Demo_example.com_20260906_1080p.mp4");
  });

  it("applies short and nodate prompt words", () => {
    expect(
      formatFilename({
        title: "One Two Three Four Five",
        quality: "720p",
        now,
        prompt: "{title}_{YYYYMMDD}_{quality}.mp4 short nodate",
      }),
    ).toBe("One_Two_Three_Four_720p.mp4");
  });

  it("strips illegal path characters", () => {
    expect(formatFilename({ title: "a/b:c", quality: "480p", now })).toBe("abc_web_20260906_480p.mp4");
  });

  it("fills {host} {index} {ext}", () => {
    expect(
      formatFilename({
        title: "Clip",
        quality: "1080p",
        now,
        prompt: "{title}_{host}_{index}.{ext}",
        host: "vimeo.com",
        index: 2,
        ext: "webm",
      }),
    ).toBe("Clip_vimeo.com_2.webm");
  });
});

describe("lintFilenameTemplate", () => {
  it("accepts the default and the documented tokens", () => {
    expect(lintFilenameTemplate("{title}_{host}_{YYYYMMDD}_{quality}.mp4")).toEqual([]);
    expect(lintFilenameTemplate("{title}_{host}_{index}.{ext} short nodate")).toEqual([]);
  });

  it("flags unknown variables, stray braces, illegal characters and empty templates", () => {
    expect(lintFilenameTemplate("{titel}.mp4")).toEqual(["Unknown variable {titel}."]);
    expect(lintFilenameTemplate("{title.mp4")).toContain("A brace is missing or extra.");
    expect(lintFilenameTemplate("{title}}.mp4")).toContain("A brace is missing or extra.");
    expect(lintFilenameTemplate("a?b.mp4")).toHaveLength(1);
    expect(lintFilenameTemplate("   ")).toHaveLength(1);
  });
});

describe("formatYmd", () => {
  it("pads month and day", () => {
    expect(formatYmd(new Date(2026, 0, 5))).toBe("20260105");
  });
});
