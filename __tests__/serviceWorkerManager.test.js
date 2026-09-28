import { rehydrateAndReconcile } from '../utils/serviceWorkerManager.js';

const makeJob = (patch = {}) => ({
  id: 'job-1',
  status: 'queued',
  updatedAt: 0,
  downloadId: null,
  progress: { percent: 0 },
  ...patch,
});

test('turns stale pre-download jobs into retryable failures', async () => {
  const state = { queue: [makeJob()] };
  await rehydrateAndReconcile(state, [], 120_000);
  expect(state.queue[0].status).toBe('failed');
  expect(state.queue[0].error.code).toBe('START_INTERRUPTED');
  expect(state.queue[0].error.retryable).toBe(true);
});

test('preserves fresh queued jobs and reconciles completed browser downloads', async () => {
  const fresh = makeJob({ updatedAt: 119_000 });
  const downloading = makeJob({ id: 'job-2', status: 'downloading', downloadId: 42 });
  const state = { queue: [fresh, downloading] };
  await rehydrateAndReconcile(state, [{ id: 42, state: 'complete' }], 120_000);
  expect(state.queue[0].status).toBe('queued');
  expect(state.queue[1].status).toBe('completed');
  expect(state.queue[1].progress.percent).toBe(100);
});
