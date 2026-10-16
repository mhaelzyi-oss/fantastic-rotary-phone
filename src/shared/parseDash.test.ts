import { describe, expect, it } from "vitest";
import { parseDashMpd } from "./parseDash";

const MPD = `<?xml version="1.0"?>
<MPD>
  <Period>
    <AdaptationSet mimeType="video/mp4">
      <Representation id="1" bandwidth="800000" width="854" height="480" codecs="avc1.42E01E">
        <BaseURL>video_480.mp4</BaseURL>
      </Representation>
      <Representation id="2" bandwidth="2500000" width="1280" height="720" codecs="avc1.64001F">
        <BaseURL>https://cdn.example/video_720.mp4</BaseURL>
      </Representation>
    </AdaptationSet>
    <AdaptationSet mimeType="audio/mp4">
      <Representation id="a" bandwidth="128000">
        <BaseURL>audio.m4a</BaseURL>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;

describe("parseDashMpd", () => {
  it("extracts video representations and skips audio", () => {
    const parsed = parseDashMpd(MPD, "https://cdn.example/stream.mpd");
    expect(parsed.encrypted).toBe(false);
    expect(parsed.variants).toHaveLength(2);
    expect(parsed.variants[0]?.url).toBe("https://cdn.example/video_480.mp4");
    expect(parsed.variants[1]?.height).toBe(720);
  });

  it("marks ContentProtection as encrypted", () => {
    const parsed = parseDashMpd(
      `<MPD><ContentProtection schemeIdUri="urn:mpeg:dash:mp4protection:2011"></ContentProtection></MPD>`,
      "https://cdn.example/drm.mpd",
    );
    expect(parsed.encrypted).toBe(true);
  });
});
