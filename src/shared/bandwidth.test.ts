import { describe, expect, it } from "vitest";
import { addSpeedSample, etaFromSpeed, type SpeedState } from "./bandwidth";

describe("addSpeedSample", () => {
  it("ignores empty or backwards samples", () => {
    const s = addSpeedSample(undefined, 0, 1000);
    expect(s.smoothed).toBeNull();
    expect(addSpeedSample(s, 100, 0)).toBe(s);
  });

  it("starts from the first sample and gains confidence", () => {
    let s: SpeedState | undefined;
    s = addSpeedSample(s, 1000, 1000);
    expect(s.smoothed).toBe(1000);
    expect(s.confidence).toBe("low");
    for (let i = 0; i < 5; i += 1) s = addSpeedSample(s, 1000, 1000);
    expect(s.confidence).toBe("high");
  });

  it("does not let one burst swing the estimate", () => {
    let s: SpeedState | undefined;
    for (let i = 0; i < 5; i += 1) s = addSpeedSample(s, 1000, 1000);
    const steady = (s as SpeedState).smoothed as number;
    s = addSpeedSample(s, 1_000_000, 1000);
    expect((s.smoothed as number) / steady).toBeLessThan(1.5);
  });
});

describe("etaFromSpeed", () => {
  it("divides the remaining bytes by the speed", () => {
    expect(etaFromSpeed(0, 1000, 100)).toBe(10);
    expect(etaFromSpeed(500, 1000, 100)).toBe(5);
  });
  it("gives no estimate without speed or a known total", () => {
    expect(etaFromSpeed(0, 1000, null)).toBeNull();
    expect(etaFromSpeed(0, 0, 100)).toBeNull();
    expect(etaFromSpeed(1000, 1000, 100)).toBeNull();
  });
});
