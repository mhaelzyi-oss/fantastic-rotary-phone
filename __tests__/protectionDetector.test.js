import { detectDashProtection, detectHlsProtection } from '../utils/protectionDetector.js';

test.each([
  '#EXT-X-KEY:METHOD=AES-128,URI="x"',
  '#EXT-X-SESSION-KEY:METHOD=SAMPLE-AES,URI="x"',
  '#EXT-X-KEY:METHOD=SAMPLE-AES-CTR,URI="x"',
])('detects HLS encryption: %s', (text) => {
  expect(detectHlsProtection(text).isProtected).toBe(true);
});

test('detects DASH content protection and leaves an ordinary manifest clear', () => {
  expect(detectDashProtection('<ContentProtection schemeIdUri="widevine"/>').isProtected).toBe(
    true,
  );
  expect(detectDashProtection('<MPD><Representation/></MPD>').isProtected).toBe(false);
});
