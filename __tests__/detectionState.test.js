import { getToolbarDetectionState, isScannablePage } from '../utils/detectionState.js';

test('scans only normal HTTP(S) pages', () => {
  expect(isScannablePage('https://example.test/watch')).toBe(true);
  expect(isScannablePage('http://localhost/page')).toBe(true);
  expect(isScannablePage('chrome://extensions')).toBe(false);
  expect(isScannablePage('file:///tmp/page.html')).toBe(false);
});

test('toolbar indicates useful media but not empty pages or unsupported links', () => {
  expect(getToolbarDetectionState([])).toEqual({ icon: 'default', count: 0, badge: '' });
  expect(getToolbarDetectionState([{ streamType: 'torrent' }])).toEqual({
    icon: 'default',
    count: 0,
    badge: '',
  });
  expect(getToolbarDetectionState([{ streamType: 'hls' }])).toEqual({
    icon: 'detected',
    count: 1,
    badge: '1',
  });
  expect(
    getToolbarDetectionState([{ streamType: 'unknown', protection: { isProtected: true } }]),
  ).toEqual({ icon: 'protected', count: 1, badge: '!' });
});
