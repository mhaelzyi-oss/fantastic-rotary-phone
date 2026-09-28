import { findTrustedSource, mergeSourceAnalysis } from '../utils/sourceSecurity.js';

const stored = {
  id: 'source-1',
  src: 'https://media.test/protected.m3u8',
  canonicalUrl: 'https://media.test/protected.m3u8',
  streamType: 'hls',
  protection: { isProtected: true, category: 'encrypted_hls', signals: ['EXT-X-KEY'] },
  variants: [],
  subtitles: [],
};

test('trusted source lookup rejects altered identity metadata', () => {
  const tabRecord = { sources: [stored] };
  expect(findTrustedSource(tabRecord, stored)).toBe(stored);
  expect(findTrustedSource(tabRecord, { ...stored, streamType: 'direct' })).toBe(stored);
  expect(
    findTrustedSource(tabRecord, { ...stored, src: 'https://other.test/clear.mp4' }),
  ).toBeNull();
});

test('analysis cannot clear existing protection or overwrite source identity/type', () => {
  const merged = mergeSourceAnalysis(stored, {
    src: 'https://other.test/clear.mp4',
    streamType: 'direct',
    protection: { isProtected: false, signals: [] },
    variants: [{ height: 1080 }],
  });
  expect(merged.src).toBe(stored.src);
  expect(merged.streamType).toBe('hls');
  expect(merged.protection.isProtected).toBe(true);
  expect(merged.protection.signals).toContain('EXT-X-KEY');
  expect(merged.variants).toEqual([{ height: 1080 }]);
});
