export function recordCompletedDownload(state, job, completedAt = Date.now()) {
  if (state.history.some((record) => record.jobId === job.id)) return false;
  state.history.unshift({
    id: crypto.randomUUID(),
    jobId: job.id,
    createdAt: job.createdAt,
    completedAt,
    status: 'completed',
    filename: job.filename,
    originHost: job.source.originHost,
    sourceType: job.source.streamType,
    quality: job.source.resolution,
    sourceUrl: job.source.src,
    thumbnail: job.source.thumbnail,
    authorizationBasis: job.authorization.basis,
    errorCode: null,
  });
  state.history = state.history.slice(0, state.settings.maxHistoryItems);
  return true;
}
