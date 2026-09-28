export function inspectQueue(state, now = Date.now()) {
  const stale = state.queue.filter(
    (job) =>
      ['queued', 'analyzing', 'downloading'].includes(job.status) &&
      now - job.updatedAt > 24 * 60 * 60 * 1000,
  );
  const duplicates = new Set();
  const duplicateIds = [];
  for (const job of state.queue) {
    const key = `${job.source?.canonicalUrl || job.source?.src}:${job.status}`;
    if (duplicates.has(key) && ['queued', 'downloading'].includes(job.status))
      duplicateIds.push(job.id);
    duplicates.add(key);
  }
  return { staleJobIds: stale.map((job) => job.id), duplicateJobIds: duplicateIds };
}
