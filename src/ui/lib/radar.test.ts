import { describe, expect, it } from "vitest";
import type { MediaItem } from "../../shared/types";
import { bestHeight, hash32, layoutBlips, MIN_RADIUS, radiusForHeight } from "./radar";

function item(url: string, height?: number, encrypted = false): MediaItem {
  return {
    url,
    kind: "progressive",
    originHost: "example.com",
    title: url,
    pageUrl: "https://example.com/",
    source: "dom",
    encrypted,
    variants: height ? [{ url, label: `${height}p`, height, encrypted, kind: "progressive" }] : [],
    subtitles: [],
  };
}

describe("radar layout", () => {
  it("hashes deterministically", () => {
    expect(hash32("https://a/b.mp4")).toBe(hash32("https://a/b.mp4"));
    expect(hash32("a")).not.toBe(hash32("b"));
  });

  it("puts higher quality closer to the center", () => {
    expect(radiusForHeight(2160)).toBeLessThan(radiusForHeight(1080));
    expect(radiusForHeight(1080)).toBeLessThan(radiusForHeight(720));
    expect(radiusForHeight(720)).toBeLessThan(radiusForHeight(480));
    expect(radiusForHeight(480)).toBeLessThan(radiusForHeight(0));
  });

  it("reads the best unlocked height, ignoring encrypted variants", () => {
    const a = item("https://a/a.mp4", 720);
    a.variants.push({ url: "x", label: "2160p", height: 2160, encrypted: true, kind: "hls" });
    expect(bestHeight(a)).toBe(720);
  });

  it("is stable between scans", () => {
    const list = [item("https://a/1.mp4", 1080), item("https://a/2.mp4", 720)];
    expect(layoutBlips(list)).toEqual(layoutBlips(list));
  });

  it("keeps every blip inside the radar box", () => {
    const list = Array.from({ length: 24 }, (_, i) => item(`https://a/${i}.mp4`, [2160, 1080, 720, 480, 0][i % 5]));
    for (const b of layoutBlips(list)) {
      expect(b.x).toBeGreaterThanOrEqual(2);
      expect(b.x).toBeLessThanOrEqual(98);
      expect(b.y).toBeGreaterThanOrEqual(2);
      expect(b.y).toBeLessThanOrEqual(98);
      expect(b.angle).toBeGreaterThanOrEqual(0);
      expect(b.angle).toBeLessThan(360);
    }
  });

  it("keeps every blip clear of the center count disc", () => {
    const list = Array.from({ length: 30 }, (_, i) => item(`https://a/${i}.mp4`, [2160, 1080, 720, 480, 0][i % 5]));
    for (const b of layoutBlips(list)) {
      expect(Math.hypot(b.x - 50, b.y - 50)).toBeGreaterThanOrEqual(MIN_RADIUS * 46 - 0.001);
      expect(b.radius).toBeGreaterThanOrEqual(MIN_RADIUS);
    }
  });

  it("still ranks quality by distance from the center", () => {
    const [uhd, hd, sd] = layoutBlips([item("https://a/u.mp4", 2160), item("https://a/h.mp4", 1080), item("https://a/s.mp4", 480)]);
    expect(uhd!.radius).toBeLessThan(sd!.radius);
    expect(hd!.radius).toBeLessThan(sd!.radius);
  });

  it("separates blips so they never stack", () => {
    const list = Array.from({ length: 8 }, (_, i) => item(`https://a/${i}.mp4`, 1080));
    const blips = layoutBlips(list);
    for (let i = 0; i < blips.length; i += 1) {
      for (let j = i + 1; j < blips.length; j += 1) {
        expect(Math.hypot(blips[i]!.x - blips[j]!.x, blips[i]!.y - blips[j]!.y)).toBeGreaterThanOrEqual(13);
      }
    }
  });

  it("marks locked streams and keeps indexes", () => {
    const blips = layoutBlips([item("https://a/1.mp4", 1080), item("https://a/2.mp4", 720, true)]);
    expect(blips.map((b) => [b.index, b.locked])).toEqual([[0, false], [1, true]]);
  });

  it("returns nothing for an empty page", () => {
    expect(layoutBlips([])).toEqual([]);
  });
});
