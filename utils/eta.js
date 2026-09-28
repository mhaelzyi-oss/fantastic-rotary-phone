export function estimateEta(totalBytes, receivedBytes, bytesPerSecond) {
  if (!(totalBytes > 0) || !(bytesPerSecond > 0)) return null;
  return Math.max(
    0,
    Math.ceil(Math.max(0, totalBytes - Math.max(0, receivedBytes || 0)) / bytesPerSecond),
  );
}

export function formatEta(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return 'Calculating…';
  if (seconds < 60) return '< 1 min';
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  return `${Math.floor(seconds / 3600)} hr ${Math.round((seconds % 3600) / 60)} min`;
}

export function formatSpeed(bytesPerSecond) {
  if (!(bytesPerSecond > 0)) return 'Calculating…';
  const units = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
  let value = bytesPerSecond,
    index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(index ? 1 : 0)} ${units[index]}`;
}
