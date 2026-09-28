import { addBandwidthSample, updateDownloadProgress } from '../utils/bandwidthEstimator.js';

test('updates throughput samples and smooths spikes', () => {
  const first = addBandwidthSample({}, 1000, 1000, 1000);
  const second = addBandwidthSample(first, 1000, 1000, 2000);
  const third = addBandwidthSample(second, 900000, 1000, 3000);
  expect(third.samples).toHaveLength(3);
  expect(third.smoothedBytesPerSecond).toBeLessThan(100000);
  expect(third.confidence).toBe('medium');
});

test('updates download percentage and leaves ETA unknown before a speed sample', () => {
  const job = {
    progress: {
      bytesReceived: null,
      totalBytes: null,
      percent: 0,
      bytesPerSecond: null,
      etaSeconds: null,
      lastMeasuredAt: null,
    },
  };
  const first = updateDownloadProgress(job, 250, 1000, 1000);
  expect(first.progress.percent).toBe(25);
  expect(first.progress.etaSeconds).toBeNull();
  const second = updateDownloadProgress(first, 500, 1000, 2000);
  expect(second.progress.percent).toBe(50);
  expect(second.progress.bytesPerSecond).toBe(250);
  expect(second.progress.etaSeconds).toBe(2);
});
