import { canRetry, isRetryable, retryDelay } from '../utils/retry.js';

test('uses bounded exponential backoff and never retries permanent blocks', () => {
  expect(retryDelay(1, () => 0)).toBe(2000);
  expect(retryDelay(2, () => 1)).toBe(5000);
  expect(isRetryable('PROTECTED_MEDIA', true)).toBe(false);
  expect(
    canRetry({
      error: { code: 'NETWORK', retryable: true },
      retry: { attempts: 2, maxAttempts: 3 },
    }),
  ).toBe(true);
  expect(
    canRetry({
      error: { code: 'NETWORK', retryable: true },
      retry: { attempts: 3, maxAttempts: 3 },
    }),
  ).toBe(false);
});
