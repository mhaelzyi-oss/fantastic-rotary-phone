import { describe, expect, it } from "vitest";
import { outputExtension, parseHlsMedia } from "./hlsMedia";

const BASE = "https://cdn.example.com/hls/720/index.m3u8";

describe("parseHlsMedia", () => {
  it("lists segments in order and resolves relative URLs", () => {
    const m = parseHlsMedia(
      "#EXTM3U\n#EXT-X-TARGETDURATION:4\n#EXT-X-PLAYLIST-TYPE:VOD\n#EXTINF:4.0,\nseg0.ts\n#EXTINF:4.0,\n/abs/seg1.ts?x=1\n#EXTINF:2.5,\nhttps://other.example/seg2.ts\n#EXT-X-ENDLIST\n",
      BASE,
    );
    expect(m.segments.map((s) => s.url)).toEqual([
      "https://cdn.example.com/hls/720/seg0.ts",
      "https://cdn.example.com/abs/seg1.ts?x=1",
      "https://other.example/seg2.ts",
    ]);
    expect(m.durationSec).toBeCloseTo(10.5);
    expect(m.live).toBe(false);
    expect(m.encrypted).toBe(false);
    expect(m.isMaster).toBe(false);
  });

  it("flags every kind of key as encrypted, but not METHOD=NONE", () => {
    const body = (key: string) => `#EXTM3U\n${key}\n#EXTINF:4,\ns.ts\n#EXT-X-ENDLIST\n`;
    expect(parseHlsMedia(body('#EXT-X-KEY:METHOD=AES-128,URI="k.bin"'), BASE).encrypted).toBe(true);
    expect(parseHlsMedia(body('#EXT-X-KEY:METHOD=SAMPLE-AES,URI="skd://x"'), BASE).encrypted).toBe(true);
    expect(parseHlsMedia(body("#EXT-X-SESSION-KEY:METHOD=AES-128"), BASE).encrypted).toBe(true);
    expect(parseHlsMedia(body("#EXT-X-KEY:METHOD=NONE"), BASE).encrypted).toBe(false);
  });

  it("detects a live playlist and a master playlist", () => {
    expect(parseHlsMedia("#EXTM3U\n#EXTINF:4,\ns.ts\n", BASE).live).toBe(true);
    expect(parseHlsMedia("#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\nlow.m3u8\n", BASE).isMaster).toBe(true);
  });

  it("reads the fMP4 init segment and byte ranges", () => {
    const m = parseHlsMedia(
      '#EXTM3U\n#EXT-X-MAP:URI="init.mp4",BYTERANGE="100@0"\n#EXTINF:4,\n#EXT-X-BYTERANGE:1000@100\nmedia.mp4\n#EXTINF:4,\n#EXT-X-BYTERANGE:500\nmedia.mp4\n#EXT-X-ENDLIST\n',
      BASE,
    );
    expect(m.map).toEqual({ url: "https://cdn.example.com/hls/720/init.mp4", range: "bytes=0-99" });
    expect(m.segments.map((s) => s.range)).toEqual(["bytes=100-1099", "bytes=1100-1599"]);
    expect(outputExtension(m)).toBe("mp4");
  });

  it("picks the output extension from the stream type", () => {
    const ts = parseHlsMedia("#EXTM3U\n#EXTINF:4,\na.ts\n#EXT-X-ENDLIST\n", BASE);
    expect(outputExtension(ts)).toBe("ts");
    const aac = parseHlsMedia("#EXTM3U\n#EXTINF:4,\na.aac\n#EXT-X-ENDLIST\n", BASE);
    expect(outputExtension(aac)).toBe("aac");
    const cmaf = parseHlsMedia("#EXTM3U\n#EXTINF:4,\na.m4s\n#EXT-X-ENDLIST\n", BASE);
    expect(outputExtension(cmaf)).toBe("mp4");
  });

  it("ignores stray lines that are not preceded by a duration", () => {
    expect(parseHlsMedia("#EXTM3U\nnot-a-segment.ts\n#EXT-X-ENDLIST\n", BASE).segments).toEqual([]);
  });
});
