import { describe, expect, it } from "vitest";
import { parseAttrs, parseHlsPlaylist } from "./parseHls";

const MASTER = `#EXTM3U
#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="English",LANGUAGE="en",URI="en.vtt"
#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360,CODECS="avc1.42e01e,mp4a.40.2"
low.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=1400000,RESOLUTION=854x480
mid.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=2800000,RESOLUTION=1280x720
high.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080
ultra.m3u8
`;

const ENCRYPTED = `#EXTM3U
#EXT-X-KEY:METHOD=AES-128,URI="key.key"
#EXTINF:4.0,
seg.ts
`;

describe("parseHlsPlaylist", () => {
  it("reads quality variants and subtitle URIs from a master playlist", () => {
    const parsed = parseHlsPlaylist(MASTER, "https://cdn.example/video/master.m3u8");
    expect(parsed.variants).toHaveLength(4);
    expect(parsed.variants.map((v) => v.height)).toEqual([360, 480, 720, 1080]);
    expect(parsed.variants[3]?.url).toBe("https://cdn.example/video/ultra.m3u8");
    expect(parsed.subtitles[0]?.url).toBe("https://cdn.example/video/en.vtt");
    expect(parsed.encrypted).toBe(false);
  });

  it("flags AES-128 media playlists as encrypted", () => {
    const parsed = parseHlsPlaylist(ENCRYPTED, "https://cdn.example/media.m3u8");
    expect(parsed.encrypted).toBe(true);
    expect(parsed.variants[0]?.encrypted).toBe(true);
  });

  it("parses quoted HLS attributes", () => {
    expect(parseAttrs('BANDWIDTH=800000,CODECS="avc1.42e01e,mp4a.40.2"').CODECS).toBe(
      "avc1.42e01e,mp4a.40.2",
    );
  });
});
