import { describe, expect, it } from "vitest";
import { streamName } from "./streamName";

const base = { title: "Page title", originHost: "cdn.example.com" };

describe("streamName", () => {
  it("uses the file name so streams on one page are distinguishable", () => {
    expect(streamName({ ...base, url: "https://cdn.example.com/films/uhd-2160p.mp4?token=1" }, 0)).toBe("uhd-2160p.mp4");
    expect(streamName({ ...base, url: "https://cdn.example.com/live/master.m3u8" }, 1)).toBe("master.m3u8");
  });

  it("decodes escaped names and survives bad escapes", () => {
    expect(streamName({ ...base, url: "https://cdn.example.com/a%20clip.mp4" }, 0)).toBe("a clip.mp4");
    expect(streamName({ ...base, url: "https://cdn.example.com/100%.mp4" }, 0)).toBe("Page title");
  });

  it("falls back to title, host, then position", () => {
    expect(streamName({ ...base, url: "https://cdn.example.com/" }, 0)).toBe("Page title");
    expect(streamName({ title: "", originHost: "cdn.example.com", url: "https://cdn.example.com/" }, 0)).toBe("cdn.example.com");
    expect(streamName({ title: "", originHost: "", url: "not a url" }, 2)).toBe("File 3");
  });
});
