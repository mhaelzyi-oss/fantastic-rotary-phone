export function addBandwidthSample(state, bytesReceived, intervalMs, timestamp = Date.now()) {
  if (!(bytesReceived > 0) || !(intervalMs > 0)) return state;
  const sample = {
    timestamp,
    bytesReceived,
    intervalMs,
    bytesPerSecond: (bytesReceived * 1000) / intervalMs,
  };
  const samples = [...(state?.samples || []), sample].slice(-8);
  const recent = samples
    .slice(-5)
    .map((entry) => entry.bytesPerSecond)
    .sort((a, b) => a - b);
  const median = recent[Math.floor(recent.length / 2)];
  const previous = state?.smoothedBytesPerSecond;
  const smoothedBytesPerSecond =
    previous == null ? median : previous * 0.7 + Math.min(median, previous * 2.5) * 0.3;
  return {
    samples,
    smoothedBytesPerSecond,
    confidence: samples.length < 3 ? 'low' : samples.length < 6 ? 'medium' : 'high',
  };
}

export function updateDownloadProgress(job, bytesReceived, totalBytes, timestamp = Date.now()) {
  const previousBytes = job.progress.bytesReceived || 0;
  const previousAt = job.progress.lastMeasuredAt;
  let bandwidth = job.bandwidth || { samples: [], smoothedBytesPerSecond: null, confidence: 'low' };
  if (bytesReceived > previousBytes && previousAt && timestamp > previousAt) {
    bandwidth = addBandwidthSample(
      bandwidth,
      bytesReceived - previousBytes,
      timestamp - previousAt,
      timestamp,
    );
  }
  const remaining = totalBytes > 0 ? Math.max(0, totalBytes - bytesReceived) : null;
  const etaSeconds =
    remaining != null && bandwidth.smoothedBytesPerSecond > 0
      ? Math.max(0, Math.ceil(remaining / bandwidth.smoothedBytesPerSecond))
      : null;
  return {
    ...job,
    bandwidth,
    progress: {
      ...job.progress,
      bytesReceived,
      totalBytes: totalBytes > 0 ? totalBytes : null,
      percent: totalBytes > 0 ? Math.min(100, Math.floor((bytesReceived / totalBytes) * 100)) : 0,
      bytesPerSecond: bandwidth.smoothedBytesPerSecond,
      etaSeconds,
      lastMeasuredAt: timestamp,
    },
  };
}
