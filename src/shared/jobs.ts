import type { DownloadJob } from "./types";

export type JobState = DownloadJob["state"];

const TRANSITIONS: Record<JobState, JobState[]> = {
  queued: ["in_progress", "interrupted", "complete"],
  in_progress: ["complete", "interrupted"],
  interrupted: ["queued", "in_progress"],
  complete: [],
};

export function canTransition(from: JobState, to: JobState): boolean {
  return from === to || TRANSITIONS[from].includes(to);
}

/** Chrome interrupt reasons that will not get better by trying again. */
export const PERMANENT_ERRORS = new Set([
  "USER_CANCELED",
  "USER_SHUTDOWN",
  "SERVER_FORBIDDEN",
  "SERVER_UNAUTHORIZED",
  "SERVER_BAD_CONTENT",
  "SERVER_CERT_PROBLEM",
  "FILE_ACCESS_DENIED",
  "FILE_NAME_TOO_LONG",
  "FILE_TOO_LARGE",
  "FILE_BLOCKED",
  "FILE_SECURITY_CHECK_FAILED",
  "BLOCKED",
  "PAGE_CLOSED",
  "INVALID_URL",
  "START_FAILED",
]);

export const MAX_ATTEMPTS = 3;
const START_GRACE_MS = 60_000;
const PAGE_SILENCE_MS = 120_000;
const STALE_MS = 24 * 60 * 60 * 1000;

export function isRetryable(code: string | undefined): boolean {
  return Boolean(code) && !PERMANENT_ERRORS.has(code as string);
}

export function canRetry(job: Pick<DownloadJob, "state" | "errorCode" | "attempts">): boolean {
  return job.state === "interrupted" && isRetryable(job.errorCode) && (job.attempts ?? 0) < MAX_ATTEMPTS;
}

/** Exponential backoff with up to 25% jitter. attempt is 1 for the first retry. */
export function retryDelayMs(attempt: number, random: () => number = Math.random): number {
  if (attempt < 1) return 0;
  const base = Math.min(60_000, 2_000 * 2 ** (attempt - 1));
  return Math.round(base * (1 + random() * 0.25));
}

/** What Chrome reports for a download, reduced to the fields we use. */
export type BrowserDownload = {
  id: number;
  state: "in_progress" | "interrupted" | "complete";
  error?: string;
};

/**
 * Bring stored jobs back in line with Chrome's own download list. Needed because the service worker is
 * stopped when idle: anything that finished or failed in the meantime was never seen.
 */
export function reconcileJobs(
  jobs: DownloadJob[],
  downloads: BrowserDownload[],
  now: number = Date.now(),
): { jobs: DownloadJob[]; changed: DownloadJob[] } {
  const byId = new Map(downloads.map((d) => [d.id, d]));
  const changed: DownloadJob[] = [];
  const next = jobs.map((job) => {
    let out = job;
    if (job.state === "queued" && job.chromeDownloadId == null && now - job.createdAt > START_GRACE_MS) {
      out = { ...job, state: "interrupted", errorCode: "START_INTERRUPTED", error: "The browser stopped before this download began." };
    } else if (job.state === "in_progress" && job.chromeDownloadId == null && !job.blobUrl) {
      // Page engine job: the page reports progress. Silence for two minutes means it is gone.
      if (now - (job.lastAt ?? job.startedAt ?? job.createdAt) > PAGE_SILENCE_MS) {
        out = { ...job, state: "interrupted", errorCode: "STALLED", error: "The page stopped reporting progress." };
      }
    } else if (job.state === "in_progress" && job.chromeDownloadId != null) {
      const item = byId.get(job.chromeDownloadId);
      if (!item) {
        out = { ...job, state: "interrupted", errorCode: "ORPHANED_DOWNLOAD", error: "The browser download could not be found." };
      } else if (item.state === "complete") {
        out = { ...job, state: "complete", percent: 100, error: undefined, errorCode: undefined };
      } else if (item.state === "interrupted") {
        out = {
          ...job,
          state: "interrupted",
          errorCode: item.error || "DOWNLOAD_INTERRUPTED",
          error: `Download interrupted (${item.error || "unknown"}).`,
        };
      }
    }
    if (out !== job) changed.push(out);
    return out;
  });
  return { jobs: next, changed };
}

/** Jobs that never finished and are old enough to drop, and exact duplicates of a live job. */
export function inspectQueue(jobs: DownloadJob[], now: number = Date.now()): { staleIds: string[]; duplicateIds: string[] } {
  const staleIds = jobs
    .filter((j) => (j.state === "queued" || j.state === "in_progress") && now - (j.lastAt ?? j.startedAt ?? j.createdAt) > STALE_MS)
    .map((j) => j.id);
  const live = new Set<string>();
  const duplicateIds: string[] = [];
  for (const job of jobs) {
    if (job.state !== "queued" && job.state !== "in_progress") continue;
    const key = job.url;
    if (live.has(key)) duplicateIds.push(job.id);
    live.add(key);
  }
  return { staleIds, duplicateIds };
}
