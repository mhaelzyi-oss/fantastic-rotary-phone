import { renderFilename, sanitizeFilename } from '../utils/filenameTemplate.js';

test('renders variables, normalizes extensions, and sanitizes portable filenames', () => {
  expect(
    renderFilename('{title}_{YYYYMMDD}_{quality}.{ext}', {
      title: 'A: film',
      quality: '1080p',
      ext: 'mp4',
      date: Date.UTC(2026, 0, 2),
    }),
  ).toBe('A_ film_20260102_1080p.mp4');
  expect(renderFilename('{title}.mkv', { title: 'clip', ext: 'mp4' })).toBe('clip.mp4');
  expect(sanitizeFilename('CON')).toBe('_CON');
  expect(sanitizeFilename('x'.repeat(240))).toHaveLength(180);
  expect(sanitizeFilename('')).toBe('media');
});
