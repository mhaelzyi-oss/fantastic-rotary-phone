export type SpeedState = {
  samples: number[];
  smoothed: number | null;
  confidence: "low" | "medium" | "high";
};

export const EMPTY_SPEED: SpeedState = { samples: [], smoothed: null, confidence: "low" };

/**
 * Add one throughput sample (bytes over an interval). The estimate is the median of the last five
 * samples, blended into the previous value so a single burst or stall does not swing the ETA.
 */
export function addSpeedSample(state: SpeedState | undefined, bytes: number, intervalMs: number): SpeedState {
  const prev = state ?? EMPTY_SPEED;
  if (!(bytes > 0) || !(intervalMs > 0)) return prev;
  const samples = [...prev.samples, (bytes * 1000) / intervalMs].slice(-8);
  const recent = samples.slice(-5).sort((a, b) => a - b);
  const median = recent[Math.floor(recent.length / 2)] as number;
  const smoothed = prev.smoothed == null ? median : prev.smoothed * 0.7 + Math.min(median, prev.smoothed * 2.5) * 0.3;
  return { samples, smoothed, confidence: samples.length < 3 ? "low" : samples.length < 6 ? "medium" : "high" };
}

export function etaFromSpeed(bytesReceived: number, totalBytes: number, bytesPerSecond: number | null | undefined): number | null {
  if (!(totalBytes > bytesReceived) || !(bytesPerSecond && bytesPerSecond > 0)) return null;
  return Math.ceil((totalBytes - bytesReceived) / bytesPerSecond);
}
