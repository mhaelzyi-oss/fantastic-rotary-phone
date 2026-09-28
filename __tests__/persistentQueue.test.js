import {
  canTransition,
  createDownloadJob,
  reconcileDownloads,
  transitionJob,
} from '../utils/persistentQueue.js';
import { defaultState } from '../utils/schema.js';

test('creates jobs, enforces transitions, and reconciles browser downloads', async () => {
  const state = defaultState();
  const job = await createDownloadJob(
    {
      src: 'https://m.test/a.mp4',
      label: 'clip',
      streamType: 'direct',
      originHost: 'm.test',
      eligibility: { canDownloadDirectly: true },
      protection: { isProtected: false },
    },
    { basis: 'owner', confirmed: true },
    state,
  );
  expect(job.status).toBe('queued');
  expect(job.filename).toMatch(/\.mp4$/);
  expect(canTransition('queued', 'downloading')).toBe(true);
  expect(() => transitionJob(job, 'completed')).toThrow();
  state.queue[0] = transitionJob(job, 'downloading', { downloadId: 7 });
  reconcileDownloads(state, [{ id: 7, state: 'complete' }]);
  expect(state.queue[0].status).toBe('completed');
});

test('creates WebM and audio jobs with matching filename extensions', async () => {
  const state = defaultState();
  const authorization = { basis: 'owner', confirmed: true };
  const webm = await createDownloadJob(
    {
      src: 'https://m.test/movie.webm',
      label: 'movie',
      streamType: 'direct',
      eligibility: { canDownloadDirectly: true },
      protection: { isProtected: false },
    },
    authorization,
    state,
  );
  const audio = await createDownloadJob(
    {
      src: 'https://m.test/audio.ogg',
      label: 'audio',
      streamType: 'audio',
      eligibility: { canDownloadDirectly: true },
      protection: { isProtected: false },
    },
    authorization,
    state,
  );
  expect(webm.filename).toMatch(/\.webm$/);
  expect(audio.filename).toMatch(/\.ogg$/);
});
