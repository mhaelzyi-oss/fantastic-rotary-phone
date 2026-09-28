import { recordCompletedDownload } from '../utils/downloadHistory.js';

test('records completion once even if multiple browser events report completion', () => {
  const state = { history: [], settings: { maxHistoryItems: 10 } };
  const job = {
    id: 'job-1',
    createdAt: 1,
    filename: 'clip.webm',
    source: { src: 'https://media.test/clip.webm', originHost: 'media.test', streamType: 'direct' },
    authorization: { basis: 'owner' },
  };
  expect(recordCompletedDownload(state, job, 2)).toBe(true);
  expect(recordCompletedDownload(state, job, 3)).toBe(false);
  expect(state.history).toHaveLength(1);
  expect(state.history[0].completedAt).toBe(2);
});
