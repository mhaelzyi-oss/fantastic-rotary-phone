/**
 * Remaining seconds from a constant-rate download model.
 * Returns null until enough bytes have arrived to estimate.
 */
export function estimateEtaSeconds(
  bytesReceived: number,
  totalBytes: number,
  elapsedMs: number,
): number | null {
  if (bytesReceived <= 0 || totalBytes <= bytesReceived || elapsedMs < 200) return null;
  const bytesPerSec = bytesReceived / (elapsedMs / 1000);
  if (bytesPerSec <= 0) return null;
  return (totalBytes - bytesReceived) / bytesPerSec;
}

export function formatEta(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds)) return "ETA --";
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `ETA ${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m < 60) return `ETA ${m}m ${rem}s`;
  const h = Math.floor(m / 60);
  return `ETA ${h}h ${m % 60}m`;
}

export function formatPercent(bytesReceived: number, totalBytes: number): number {
  if (totalBytes <= 0) return 0;
  return Math.min(100, Math.max(0, (bytesReceived / totalBytes) * 100));
}

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "Unknown size";
  const units = ["B", "KB", "MB", "GB"];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}
