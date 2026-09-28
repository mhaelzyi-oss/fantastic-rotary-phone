import { createTrustedSubtitleSource } from '../utils/subtitleSource.js';

const parent = {
  src: 'https://media.test/video.m3u8',
  label: 'Sample',
  pageUrl: 'https://media.test/page',
  pageTitle: 'Sample page',
  streamType: 'hls',
  protection: { isProtected: false, category: 'none', signals: [] },
  subtitles: [{ language: 'en', label: 'English', url: 'https://media.test/captions-en.vtt' }],
};

test('creates an eligible subtitle source only from a URL listed on its safe parent', () => {
  const source = createTrustedSubtitleSource(parent, parent.subtitles[0].url);
  expect(source.streamType).toBe('subtitle');
  expect(source.eligibility.canDownloadDirectly).toBe(true);
  expect(source.pageUrl).toBe(parent.pageUrl);
  expect(() => createTrustedSubtitleSource(parent, 'https://other.test/captions.vtt')).toThrow();
});

test('rejects subtitle downloads for protected parent media', () => {
  expect(() =>
    createTrustedSubtitleSource(
      { ...parent, protection: { isProtected: true } },
      parent.subtitles[0].url,
    ),
  ).toThrow(/Protected media/);
});
