import { createAttestation } from './authorization.js';
import { evaluateEligibility } from './sourceEligibility.js';
import { renderFilename } from './filenameTemplate.js';
import { sourceDownloadExtension } from './sourceNormalizer.js';

const transitions = {
  queued: ['analyzing', 'downloading', 'canceled', 'blocked'],
  analyzing: ['awaiting_authorization', 'blocked', 'failed'],
  awaiting_authorization: ['queued', 'canceled'],
  downloading: ['completed', 'failed', 'blocked', 'canceled'],
  completed: [],
  failed: ['queued'],
  blocked: [],
  canceled: [],
};

export function canTransition(from, to) {
  return transitions[from]?.includes(to) || false;
}

export async function createDownloadJob(source, authorization, state) {
  const eligibility = evaluateEligibility(source);
  source.eligibility = eligibility;
  const attestation = createAttestation(authorization, source);
  const job = {
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    status: 'queued',
    source,
    selectedVariant: null,
    filename: renderFilename(state.settings.filenameTemplate, {
      title: source.label,
      quality: source.resolution,
      ext: sourceDownloadExtension(source),
    }),
    downloadId: null,
    authorization: attestation,
    progress: {
      percent: 0,
      bytesReceived: null,
      totalBytes: null,
      bytesPerSecond: null,
      etaSeconds: null,
      startedAt: null,
      lastMeasuredAt: null,
    },
    retry: { attempts: 0, maxAttempts: 3, nextRetryAt: null, lastFailureAt: null },
    error: null,
  };
  state.queue.push(job);
  return job;
}

export function transitionJob(job, status, patch = {}) {
  if (!canTransition(job.status, status))
    throw new Error(`Invalid job transition: ${job.status} -> ${status}`);
  return { ...job, ...patch, status, updatedAt: Date.now() };
}

export function reconcileDownloads(state, downloads = []) {
  const byId = new Map(downloads.map((item) => [item.id, item]));
  state.queue = state.queue.map((job) => {
    const item = job.downloadId == null ? null : byId.get(job.downloadId);
    if (!item || job.status !== 'downloading') return job;
    if (item.state === 'complete')
      return transitionJob(job, 'completed', { progress: { ...job.progress, percent: 100 } });
    if (item.state === 'interrupted')
      return transitionJob(job, 'failed', {
        error: {
          code: item.error || 'DOWNLOAD_INTERRUPTED',
          message: 'The browser interrupted this download.',
          technicalDetail: null,
          retryable: true,
        },
      });
    return job;
  });
  return state;
}
