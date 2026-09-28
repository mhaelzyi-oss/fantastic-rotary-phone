import {
  canonicalizeUrl,
  normalizeSource,
  sourceDownloadExtension,
} from '../utils/sourceNormalizer.js';

test('resolves relative and protocol-relative URLs while preserving query strings', () => {
  expect(
    normalizeSource({ src: '../video.mp4?sig=a%2Fb#frag' }, 'https://example.test/path/page').src,
  ).toBe('https://example.test/video.mp4?sig=a%2Fb#frag');
  expect(
    normalizeSource({ src: '//cdn.example.test/a.webm' }, 'https://example.test/page').src,
  ).toBe('https://cdn.example.test/a.webm');
  expect(canonicalizeUrl('https://cdn.example.test/a.mp4?token=abc#player')).toBe(
    'https://cdn.example.test/a.mp4?token=abc',
  );
});

test('classifies known MIME types and extensions with a useful label fallback', () => {
  expect(normalizeSource({ src: 'https://media.test/a.mp4' }).streamType).toBe('direct');
  expect(normalizeSource({ src: 'https://media.test/a', mime: 'audio/ogg' }).streamType).toBe(
    'audio',
  );
  expect(normalizeSource({ src: 'https://media.test/a.m3u8' }).streamType).toBe('hls');
  expect(normalizeSource({ src: 'https://media.test/a.webm' }).label).toBe('a.webm');
});

test('malformed path escapes do not abort source normalization', () => {
  const source = normalizeSource({ src: 'https://media.test/bad%ZZ.mp4' });
  expect(source.streamType).toBe('direct');
  expect(source.label).toBe('bad%ZZ.mp4');
});

test('chooses the downloaded file extension from the source or its declared MIME type', () => {
  expect(sourceDownloadExtension(normalizeSource({ src: 'https://media.test/movie.webm' }))).toBe(
    'webm',
  );
  expect(sourceDownloadExtension(normalizeSource({ src: 'https://media.test/movie.mov' }))).toBe(
    'mov',
  );
  expect(
    sourceDownloadExtension(
      normalizeSource({ src: 'https://media.test/signed?id=1', mime: 'video/webm' }),
    ),
  ).toBe('webm');
  expect(
    sourceDownloadExtension(
      normalizeSource({ src: 'https://media.test/audio', mime: 'audio/ogg' }),
    ),
  ).toBe('ogg');
});

test('classifies subtitle sidecars and retains their file extensions', () => {
  const subtitle = normalizeSource({ src: 'https://media.test/captions-en.vtt' });
  expect(subtitle.streamType).toBe('subtitle');
  expect(sourceDownloadExtension(subtitle)).toBe('vtt');
});
