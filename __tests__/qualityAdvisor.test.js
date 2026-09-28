import { recommendVariant, variantPreferenceKey } from '../utils/qualityAdvisor.js';

const variants = [
  { height: 480, estimatedSize: 10 },
  { height: 720, estimatedSize: 30 },
  { height: 1080, estimatedSize: 60 },
  { height: 2160, estimatedSize: 150, protection: { isProtected: true } },
];

test('selects balance, highest, smallest, fastest, and remembered choices safely', () => {
  expect(recommendVariant(variants, 'best_balance').variant.height).toBe(1080);
  expect(recommendVariant(variants, 'best_quality').variant.height).toBe(1080);
  expect(recommendVariant(variants, 'smallest').variant.height).toBe(480);
  expect(
    recommendVariant(variants, 'fastest', { bytesPerSecond: 1, targetSeconds: 20 }).variant.height,
  ).toBe(480);
  expect(recommendVariant(variants, 'best_quality', { remembered: 720 }).variant.height).toBe(720);
});

test('remembers variants without dimensions and does not invent a fastest recommendation', () => {
  const variant = { bandwidth: 900_000, url: 'https://media.test/variant.m3u8' };
  const key = variantPreferenceKey(variant);
  expect(recommendVariant([variant], 'best_quality', { remembered: key }).variant).toBe(variant);
  expect(
    variantPreferenceKey({ ...variant, url: 'https://media.test/variant.m3u8?token=renewed' }),
  ).toBe(key);
  expect(recommendVariant([variant], 'fastest').variant).toBeNull();
  expect(recommendVariant([variant], 'fastest').reason).toMatch(
    /size estimate and observed download speed/,
  );
});

test('fastest mode prefers the highest quality meeting its time target', () => {
  const selected = recommendVariant(variants, 'fastest', {
    bytesPerSecond: 1,
    targetSeconds: 70,
  });
  expect(selected.variant.height).toBe(1080);
  expect(selected.reason).toMatch(/Highest quality/);
});
