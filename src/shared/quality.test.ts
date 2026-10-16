import { describe, expect, it } from "vitest";
import { pickDefaultVariant, qualityBucket } from "./quality";
import type { QualityVariant } from "./types";

function v(partial: Partial<QualityVariant> & Pick<QualityVariant, "url" | "label">): QualityVariant {
  return { encrypted: false, kind: "progressive", ...partial };
}

describe("pickDefaultVariant", () => {
  const ladder: QualityVariant[] = [
    v({ url: "u360", label: "360p", height: 360, bandwidth: 400000 }),
    v({ url: "u480", label: "480p", height: 480, bandwidth: 800000 }),
    v({ url: "u720", label: "720p", height: 720, bandwidth: 2000000 }),
    v({ url: "u1080", label: "1080p", height: 1080, bandwidth: 5000000 }),
    v({ url: "drm", label: "2160p", height: 2160, bandwidth: 9000000, encrypted: true }),
  ];

  it("prefers 1080p over 720p and 480p and skips encrypted", () => {
    expect(pickDefaultVariant(ladder)?.url).toBe("u1080");
  });

  it("falls back 1080 > 720 > 480", () => {
    expect(pickDefaultVariant(ladder.filter((x) => (x.height ?? 0) < 1080))?.url).toBe("u720");
    expect(pickDefaultVariant(ladder.filter((x) => (x.height ?? 0) <= 480))?.url).toBe("u480");
  });

  it("honors an explicit 720 preference", () => {
    expect(pickDefaultVariant(ladder, "720")?.url).toBe("u720");
  });

  it("returns undefined when every variant is encrypted", () => {
    expect(pickDefaultVariant(ladder.filter((x) => x.encrypted))).toBeUndefined();
  });

  it("caps height when maxHeight is set", () => {
    expect(pickDefaultVariant(ladder, "auto", "720")?.url).toBe("u720");
  });

  it("best mode takes the highest open resolution, smallest takes the lightest", () => {
    const open = [...ladder.filter((x) => !x.encrypted), v({ url: "u1440", label: "1440p", height: 1440, bandwidth: 7000000 })];
    expect(pickDefaultVariant(open, "auto", "auto", "best")?.url).toBe("u1440");
    expect(pickDefaultVariant(open, "auto", "auto", "smallest")?.url).toBe("u360");
    expect(pickDefaultVariant(open, "auto", "720", "best")?.url).toBe("u720");
    expect(pickDefaultVariant(ladder, "auto", "auto", "best")?.url).not.toBe("drm");
  });

  it("an explicit quality chip wins over the mode", () => {
    expect(pickDefaultVariant(ladder, "480", "auto", "best")?.url).toBe("u480");
  });
});

describe("qualityBucket", () => {
  it("maps heights onto the 1080/720/480 ladder", () => {
    expect(qualityBucket(1080)).toBe(1080);
    expect(qualityBucket(900)).toBe(720);
    expect(qualityBucket(500)).toBe(480);
    expect(qualityBucket(240)).toBe(0);
  });
});
