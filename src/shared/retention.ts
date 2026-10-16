import type { DownloadJob } from "./types";

/** How long finished downloads, history and the diagnostics log are kept on this device. The saved list is yours until you remove items. */
export const RETENTION_DAYS = 30;
const DAY_MS = 86_400_000;

export function pruneByAge<T>(items: T[], at: (item: T) => number, now: number = Date.now(), days: number = RETENTION_DAYS): T[] {
  const cutoff = now - days * DAY_MS;
  return items.filter((item) => at(item) >= cutoff);
}

/** Finished jobs expire. Jobs still running or waiting for a retry are never dropped by age. */
export function pruneJobs(jobs: DownloadJob[], now: number = Date.now(), days: number = RETENTION_DAYS): DownloadJob[] {
  const cutoff = now - days * DAY_MS;
  return jobs.filter((j) => {
    const finished = j.state === "complete" || (j.state === "interrupted" && j.nextRetryAt == null);
    return !finished || (j.lastAt ?? j.startedAt ?? j.createdAt) >= cutoff;
  });
}
