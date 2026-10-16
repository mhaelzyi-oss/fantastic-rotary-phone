import type { QualityVariant, UserPrefs } from "./types";

const LADDER = [2160, 1080, 720, 480] as const;

export function qualityBucket(height = 0): 2160 | 1080 | 720 | 480 | 0 {
  if (height >= 2160) return 2160;
  if (height >= 1080) return 1080;
  if (height >= 720) return 720;
  if (height >= 480) return 480;
  return 0;
}

/**
 * Highest non-encrypted stream, preferring 1080p then 720p then 480p,
 * then the remaining max bitrate.
 */
export function pickDefaultVariant(
  variants: QualityVariant[],
  preferred: UserPrefs["preferredQuality"] = "auto",
  maxHeight: UserPrefs["maxHeight"] = "auto",
  mode: UserPrefs["qualityMode"] = "balanced",
): QualityVariant | undefined {
  const cap = maxHeight === "auto" ? Infinity : Number.parseInt(maxHeight, 10);
  const open = variants.filter((v) => !v.encrypted && (v.height == null || v.height <= cap));
  if (!open.length) return undefined;

  const byBitrate = (list: QualityVariant[]) =>
    [...list].sort((a, b) => (b.bandwidth ?? b.height ?? 0) - (a.bandwidth ?? a.height ?? 0));

  if (preferred === "auto" && mode === "best") {
    return [...open].sort((a, b) => (b.height ?? 0) - (a.height ?? 0) || (b.bandwidth ?? 0) - (a.bandwidth ?? 0))[0];
  }
  if (preferred === "auto" && mode === "smallest") {
    const weight = (v: QualityVariant) => v.bandwidth ?? (v.height ? v.height * 1000 : Infinity);
    return [...open].sort((a, b) => weight(a) - weight(b))[0];
  }

  if (preferred !== "auto") {
    const target = Number.parseInt(preferred, 10);
    const exact = open.filter((v) => qualityBucket(v.height ?? 0) === target);
    if (exact.length) return byBitrate(exact)[0];
  }

  for (const rung of LADDER) {
    const bucket = open.filter((v) => qualityBucket(v.height ?? 0) === rung);
    if (bucket.length) return byBitrate(bucket)[0];
  }

  return byBitrate(open)[0];
}

export function variantLabel(v: QualityVariant): string {
  const bits = [v.label];
  if (v.bandwidth) bits.push(`${Math.round(v.bandwidth / 1000)} kbps`);
  if (v.codecs) bits.push(v.codecs.split(",")[0] ?? v.codecs);
  return bits.join(" · ");
}

export function estimateSizeBytes(bandwidth?: number, durationSec?: number): number | undefined {
  if (!bandwidth || !durationSec || durationSec <= 0) return undefined;
  return Math.round((bandwidth * durationSec) / 8);
}
