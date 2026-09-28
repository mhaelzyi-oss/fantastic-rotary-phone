import { estimateEta, formatEta, formatSpeed } from '../utils/eta.js';

test('keeps unknown and negative estimates honest and formats useful intervals', () => {
  expect(estimateEta(null, 0, 10)).toBeNull();
  expect(estimateEta(5, 10, 1)).toBe(0);
  expect(formatEta(null)).toBe('Calculating…');
  expect(formatEta(32)).toBe('< 1 min');
  expect(formatEta(7200)).toBe('2 hr 0 min');
  expect(formatSpeed(1024 * 1024)).toBe('1.0 MB/s');
});
