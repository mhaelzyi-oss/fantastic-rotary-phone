export async function rehydrateAndReconcile(state, downloads, now = Date.now()) {
  const byId = new Map(downloads.map((download) => [download.id, download]));
  state.queue = state.queue.map((job) => {
    if (job.status === 'queued' && job.downloadId == null && now - job.updatedAt > 60_000)
      return {
        ...job,
        status: 'failed',
        error: {
          code: 'START_INTERRUPTED',
          message: 'The browser stopped before accepting this download.',
          retryable: true,
        },
        updatedAt: now,
      };
    if (job.status !== 'downloading') return job;
    const download = byId.get(job.downloadId);
    if (!download)
      return {
        ...job,
        status: 'failed',
        error: {
          code: 'ORPHANED_DOWNLOAD',
          message: 'The browser download could not be found.',
          retryable: true,
        },
        updatedAt: now,
      };
    if (download.state === 'complete')
      return {
        ...job,
        status: 'completed',
        progress: { ...job.progress, percent: 100 },
        updatedAt: now,
      };
    if (download.state === 'interrupted')
      return {
        ...job,
        status: 'failed',
        error: {
          code: download.error || 'DOWNLOAD_INTERRUPTED',
          message: 'The browser interrupted this download.',
          retryable: true,
        },
        updatedAt: now,
      };
    return job;
  });
  return state;
}
