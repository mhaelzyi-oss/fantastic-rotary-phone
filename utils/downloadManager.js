import { updateState } from './storage.js';
import { createDownloadJob, transitionJob } from './persistentQueue.js';
import { recordCompletedDownload } from './downloadHistory.js';

export async function startDirectDownload(source, authorization) {
  if (!globalThis.chrome?.downloads?.download)
    throw new Error('Browser downloads API is unavailable.');
  const created = await updateState(async (state) => {
    const job = await createDownloadJob(source, authorization, state);
    state.queue[state.queue.length - 1] = job;
    return state;
  });
  const job = created.queue.at(-1);
  try {
    const downloadId = await chrome.downloads.download({
      url: source.src,
      filename: job.filename,
      conflictAction: 'uniquify',
      saveAs: false,
    });
    await updateState((state) => {
      const item = state.queue.find((entry) => entry.id === job.id);
      if (item) {
        Object.assign(
          item,
          transitionJob(item, 'downloading', {
            downloadId,
            progress: { ...item.progress, startedAt: Date.now() },
          }),
        );
      }
      return state;
    });
    const [browserDownload] = await chrome.downloads.search({ id: downloadId });
    if (browserDownload?.state === 'complete') {
      await updateState((state) => {
        const item = state.queue.find((entry) => entry.id === job.id);
        if (item?.status === 'downloading') {
          item.status = 'completed';
          item.progress.percent = 100;
          item.updatedAt = Date.now();
          recordCompletedDownload(state, item);
        }
        return state;
      });
    }
    return { jobId: job.id, downloadId };
  } catch (error) {
    await updateState((state) => {
      const item = state.queue.find((entry) => entry.id === job.id);
      if (item) {
        if (item.status === 'queued') item.status = 'failed';
        item.error = {
          code: 'BROWSER_DOWNLOAD_FAILED',
          message: 'The browser could not start this download.',
          technicalDetail: String(error),
          retryable: false,
        };
      }
      return state;
    });
    throw error;
  }
}
