import { describe, expect, it } from "vitest";
import { estimateEtaSeconds, formatEta, formatPercent } from "./eta";

describe("estimateEtaSeconds", () => {
  it("returns null until enough progress exists", () => {
    expect(estimateEtaSeconds(0, 1000, 1000)).toBeNull();
    expect(estimateEtaSeconds(100, 1000, 100)).toBeNull();
  });

  it("estimates remaining time from constant throughput", () => {
    expect(estimateEtaSeconds(1_000_000, 4_000_000, 1000)).toBe(3);
  });
});

describe("formatEta", () => {
  it("formats seconds and minutes", () => {
    expect(formatEta(null)).toBe("ETA --");
    expect(formatEta(9)).toBe("ETA 9s");
    expect(formatEta(125)).toBe("ETA 2m 5s");
  });
});

describe("formatPercent", () => {
  it("clamps to 0–100", () => {
    expect(formatPercent(50, 100)).toBe(50);
    expect(formatPercent(0, 0)).toBe(0);
    expect(formatPercent(150, 100)).toBe(100);
  });
});
