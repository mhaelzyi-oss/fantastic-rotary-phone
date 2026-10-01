import { mergeDiscoveredSource } from '../utils/sourceScanner.js';

test('merges richer metadata for duplicate URLs without losing detected protection', () => {
  const first = {
    id: 'stable-id',
    src: 'https://media.test/stream.m3u8',
    streamType: 'unknown',
    mime: null,
    width: null,
    height: null,
    subtitles: [],
    variants: [],
    protection: { isProtected: true, category: 'encrypted_hls', signals: ['EXT-X-KEY'] },
  };
  const later = {
    id: 'other-id',
    src: first.src,
    streamType: 'hls',
    mime: 'application/vnd.apple.mpegurl',
    width: 1920,
    height: 1080,
    codecs: 'avc1.640028',
    subtitles: [{ url: 'https://media.test/en.vtt', language: 'en' }],
    protection: { isProtected: false, category: 'none', signals: [] },
  };
  const merged = mergeDiscoveredSource(first, later);
  expect(merged.id).toBe('stable-id');
  expect(merged.streamType).toBe('hls');
  expect(merged.mime).toBe('application/vnd.apple.mpegurl');
  expect(merged.height).toBe(1080);
  expect(merged.codecs).toBe('avc1.640028');
  expect(merged.protection.isProtected).toBe(true);
  expect(merged.protection.signals).toContain('EXT-X-KEY');
  expect(merged.subtitles).toHaveLength(1);
});
