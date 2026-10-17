import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

function runScript(file: string) {
  const ctx: Record<string, unknown> = { console };
  ctx.globalThis = ctx;
  vm.runInNewContext(readFileSync(resolve(file), "utf8"), ctx);
  return ctx;
}

function loadMp4() {
  return runScript("web-tools/shared/kui-mp4.js").KuiMp4 as any;
}

function loadGif() {
  return runScript("web-tools/shared/kui-gif.js").KuiGif as {
    encode: (frames: Uint8Array[], w: number, h: number, delay: number) => Uint8Array;
  };
}

function sampleTrack(KuiMp4: ReturnType<typeof loadMp4>, n = 10) {
  const samples = [];
  for (let i = 0; i < n; i++) {
    samples.push({
      data: new Uint8Array([0, 0, 0, 4, i, 9, 8, 7]),
      dts: i * 100,
      cts: i * 100,
      duration: 100,
      isSync: i % 5 === 0,
    });
  }
  return {
    handler: "vide",
    timescale: 1000,
    width: 16,
    height: 16,
    sampleDesc: KuiMp4.makeAvc1Desc(16, 16),
    samples,
  };
}

describe("kui-mp4 remux", () => {
  it("round-trips samples into a clean MP4", () => {
    const KuiMp4 = loadMp4();
    const track = sampleTrack(KuiMp4);
    const bytes = KuiMp4.build([track]);
    expect(String.fromCharCode(...bytes.slice(4, 8))).toBe("ftyp");
    const movie = KuiMp4.parse(bytes);
    expect(KuiMp4.refuseReason(movie)).toBeNull();
    expect(movie.tracks).toHaveLength(1);
    expect(movie.tracks[0]!.codec).toBe("avc1");
    expect(movie.tracks[0]!.width).toBe(16);
    expect(movie.tracks[0]!.samples).toHaveLength(10);
    expect(Array.from(movie.tracks[0]!.samples[3]!.data)).toEqual([0, 0, 0, 4, 3, 9, 8, 7]);
    expect(movie.tracks[0]!.samples[0]!.isSync).toBe(true);
    expect(movie.tracks[0]!.samples[1]!.isSync).toBe(false);
  });

  it("trims and joins matching tracks", () => {
    const KuiMp4 = loadMp4();
    const track = sampleTrack(KuiMp4, 20);
    const cut = KuiMp4.sliceTrack(track, 0.5, 1.2);
    expect(cut.samples.length).toBeGreaterThan(0);
    const joined = KuiMp4.concatTracks([track, track]);
    expect(joined.samples).toHaveLength(40);
  });

  it("refuses WebM and playlists instead of fetching anything", () => {
    const KuiMp4 = loadMp4();
    expect(KuiMp4.sniff(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]))).toBe("webm");
    expect(() => KuiMp4.parse(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0]))).toThrow(/WebM/);
    expect(() => KuiMp4.parse(new TextEncoder().encode("#EXTM3U\n"))).toThrow(/playlist|MP4/i);
  });
});

describe("kui-gif", () => {
  it("writes a GIF89a header", () => {
    const KuiGif = loadGif();
    const frame = new Uint8Array([0, 1, 2, 3]);
    const gif = KuiGif.encode([frame], 2, 2, 10);
    expect(String.fromCharCode(gif[0]!, gif[1]!, gif[2]!, gif[3]!, gif[4]!, gif[5]!)).toBe("GIF89a");
    expect(gif[gif.length - 1]).toBe(0x3b);
  });
});
