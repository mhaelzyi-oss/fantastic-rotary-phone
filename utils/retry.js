export const PERMANENT_FAILURES = new Set([
  'PROTECTED_MEDIA',
  'TORRENT_UNSUPPORTED',
  'MISSING_PERMISSION',
  'AUTH_REQUIRED',
  'CORS_DENIED',
  'INVALID_URL',
  'UNSUPPORTED_TYPE',
  'SIGNED_URL_EXPIRED',
  'LIVE_STREAM_UNSUPPORTED',
  'USER_CANCELED',
]);

export function isRetryable(code, explicitlyRetryable = false) {
  return Boolean(explicitlyRetryable) && !PERMANENT_FAILURES.has(code);
}

export function retryDelay(attempt, random = Math.random) {
  if (attempt < 1) return 0;
  const base = Math.min(60000, 2000 * 2 ** (attempt - 1));
  return Math.round(base * (1 + random() * 0.25));
}

export function canRetry(job) {
  return (
    isRetryable(job.error?.code, job.error?.retryable) && job.retry.attempts < job.retry.maxAttempts
  );
}
