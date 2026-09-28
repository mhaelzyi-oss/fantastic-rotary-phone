import { normalizeSource } from '../utils/sourceNormalizer.js';
import { evaluateEligibility } from '../utils/sourceEligibility.js';

test('direct sources can download, protected media and torrents cannot', () => {
  expect(
    evaluateEligibility(normalizeSource({ src: 'https://m.test/a.mp4' })).canDownloadDirectly,
  ).toBe(true);
  expect(
    evaluateEligibility(
      normalizeSource({ src: 'https://m.test/a.mp4', protection: { isProtected: true } }),
    ).blockCode,
  ).toBe('PROTECTED_MEDIA');
  expect(
    evaluateEligibility(normalizeSource({ src: 'magnet:?xt=urn:btih:example' })).blockCode,
  ).toBe('TORRENT_UNSUPPORTED');
});

test('missing and unknown sources cannot start direct downloads', () => {
  expect(evaluateEligibility(null).blockCode).toBe('MISSING_URL');
  expect(
    evaluateEligibility(normalizeSource({ src: 'https://m.test/item' })).canDownloadDirectly,
  ).toBe(false);
});

test('allows accessible subtitle sidecars through the declaration-gated direct path', () => {
  const result = evaluateEligibility(normalizeSource({ src: 'https://m.test/captions.vtt' }));
  expect(result.canDownloadDirectly).toBe(true);
  expect(result.canSaveSubtitles).toBe(true);
});
