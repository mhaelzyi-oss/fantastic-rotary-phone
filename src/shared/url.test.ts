import { describe, expect, it } from "vitest";
import { classifyUrl, extractMediaUrlsFromText, fileNameFromDisposition, isMediaMime, isSegmentUrl, looksLikeVideo, mediaMedium } from "./url";

describe("extractMediaUrlsFromText", () => {
  it("finds hidden playlist and mp4 URLs inside JSON-like script text", () => {
    const text = `var cfg = {"src":"https://cdn.example/hide/master.m3u8?token=1","file":"https://cdn.example/a.mp4"};`;
    expect(extractMediaUrlsFromText(text)).toEqual([
      "https://cdn.example/hide/master.m3u8?token=1",
      "https://cdn.example/a.mp4",
    ]);
  });
});

describe("isMediaMime", () => {
  it("accepts video, HLS and DASH response types", () => {
    for (const m of ["video/mp4", "video/webm; codecs=vp9", "application/vnd.apple.mpegurl", "application/x-mpegURL", "application/dash+xml", "audio/mpegurl"]) {
      expect(isMediaMime(m), m).toBe(true);
    }
  });
  it("rejects everything else", () => {
    for (const m of ["text/html", "application/json", "image/png", "", undefined]) {
      expect(isMediaMime(m), String(m)).toBe(false);
    }
  });
  it("accepts audio files and rejects stream pieces named like audio", () => {
    expect(isMediaMime("audio/mpeg")).toBe(true);
    expect(isMediaMime("audio/mp4")).toBe(true);
    expect(classifyUrl("https://cdn.example/talk.mp3")).toBe("progressive");
    expect(classifyUrl("https://cdn.example/api/a", "audio/aac")).toBe("progressive");
    expect(isSegmentUrl("https://cdn.example/song.aac")).toBe(false);
    expect(isSegmentUrl("https://cdn.example/v/seg-1.aac")).toBe(true);
    expect(classifyUrl("https://cdn.example/talk.mp3#t=12")).toBe("progressive");
    expect(classifyUrl("https://cdn.example/talk.m4a?note=mpegurl")).toBe("progressive");
    expect(classifyUrl("https://cdn.example/api/bed?ext=aac")).toBe("progressive");
    expect(mediaMedium("https://cdn.example/api/bed?ext=m4a")).toBe("audio");
    expect(mediaMedium("https://cdn.example/talk.mp3#t=1")).toBe("audio");
  });
});

describe("isSegmentUrl", () => {
  it("recognises stream pieces", () => {
    for (const u of [
      "https://cdn.example/v/seg-12.ts",
      "https://cdn.example/v/chunk0001.m4s",
      "https://cdn.example/v/segment_4.mp4",
      "https://cdn.example/v/init.mp4",
      "https://cdn.example/v/init-v1.mp4",
      "https://cdn.example/v/frag3.mp4?x=1",
      "https://cdn.example/v/seg-1.m4a",
      "https://cdn.example/v/chunk-2.mp3",
      "https://cdn.example/v/segment_4.aac",
    ]) {
      expect(isSegmentUrl(u), u).toBe(true);
    }
  });
  it("does not mistake whole files for pieces", () => {
    for (const u of [
      "https://cdn.example/film.mp4",
      "https://cdn.example/segments-of-life.mp4",
      "https://cdn.example/a/master.m3u8",
      "https://cdn.example/song.mp3",
      "https://cdn.example/song.m4a",
      "https://cdn.example/song.aac",
      "https://cdn.example/segments/song.aac",
      "https://cdn.example/segovia.aac",
      "https://cdn.example/talk.mp3#t=1",
    ]) {
      expect(isSegmentUrl(u), u).toBe(false);
    }
  });
});

describe("fileNameFromDisposition", () => {
  it("reads a filename from content-disposition, including a language tag", () => {
    expect(fileNameFromDisposition('attachment; filename="clip.mp4"')).toBe("clip.mp4");
    expect(fileNameFromDisposition("attachment; filename*=UTF-8''bed%20name.mp3")).toBe("bed name.mp3");
    expect(fileNameFromDisposition("attachment; filename*=UTF-8'en'bed.mp3")).toBe("bed.mp3");
  });
});

describe("extensionless streams with a known response type", () => {
  it("classifies by content type when the URL has no extension", () => {
    expect(classifyUrl("https://cdn.example/stream/123", "video/mp4")).toBe("progressive");
    expect(classifyUrl("https://cdn.example/play?id=9", "application/vnd.apple.mpegurl")).toBe("hls");
    expect(classifyUrl("https://cdn.example/play?id=9", "application/dash+xml")).toBe("dash");
    expect(looksLikeVideo("https://cdn.example/stream/123", "video/mp4")).toBe(true);
    expect(looksLikeVideo("https://cdn.example/stream/123")).toBe(false);
  });
});
