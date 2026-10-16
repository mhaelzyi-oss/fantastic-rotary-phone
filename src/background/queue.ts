import { addSpeedSample, type SpeedState } from "../shared/bandwidth";
import { withSubfolder } from "../shared/history";
import { canRetry, inspectQueue, reconcileJobs, retryDelayMs, type BrowserDownload } from "../shared/jobs";
import type { RuntimeMessage } from "../shared/messages";
import type { DownloadJob, DownloadProgress } from "../shared/types";
import { pruneJobs } from "../shared/retention";
import { originHost } from "../shared/url";
import { broadcast, interruptMessage, progressFromDelta, recordHistory, startChromeDownload } from "./downloads";
import { loadPrefs, loadQueue, recordDiagnostic, saveQueue } from "./storage";

export const RETRY_PREFIX = "vpf-retry:";
const MAX_JOBS = 50;

const jobs = new Map<string, DownloadJob>();
const byChromeId = new Map<number, string>();
const speeds = new Map<string, SpeedState>();
let hydrating: Promise<void> | undefined;

/**
 * Load the stored queue and bring it back in line with Chrome. The service worker is stopped when idle,
 * so downloads may have finished or failed while it was away; those are settled here.
 */
function hydrate(): Promise<void> {
  hydrating ??= (async () => {
    const stored = await loadQueue();
    const running = stored.filter((j) => j.state === "in_progress" && j.chromeDownloadId != null);
    const downloads: BrowserDownload[] = [];
    for (const job of running) {
      try {
        const [item] = await chrome.downloads.search({ id: job.chromeDownloadId as number });
        if (item) downloads.push({ id: item.id, state: item.state, error: item.error });
      } catch {
        /* treated as missing */
      }
    }
    const { jobs: fixed, changed } = reconcileJobs(stored, downloads);
    const { staleIds } = inspectQueue(fixed);
    const unexpired = new Set(pruneJobs(fixed).map((j) => j.id));
    let expired = 0;
    for (const job of fixed) {
      if (!unexpired.has(job.id)) {
        expired += 1;
        continue;
      }
      if (staleIds.includes(job.id)) continue;
      jobs.set(job.id, job);
      if (job.state === "in_progress" && job.chromeDownloadId != null) byChromeId.set(job.chromeDownloadId, job.id);
    }
    for (const job of changed) await settle(job);
    if (changed.length || staleIds.length || expired) await persist();
  })();
  return hydrating;
}

async function persist(): Promise<void> {
  const keep = [...jobs.values()].sort((a, b) => b.createdAt - a.createdAt).slice(0, MAX_JOBS);
  const keepIds = new Set(keep.map((j) => j.id));
  for (const id of [...jobs.keys()]) if (!keepIds.has(id)) jobs.delete(id);
  await saveQueue(keep);
  broadcast({ type: "QUEUE_UPDATED", jobs: keep });
}

export async function listJobs(): Promise<DownloadJob[]> {
  await hydrate();
  return [...jobs.values()];
}

export async function knownJobUrls(): Promise<Set<string>> {
  await hydrate();
  return new Set([...jobs.values()].map((j) => j.url));
}

function scheduleRetry(job: DownloadJob): void {
  const attempt = (job.attempts ?? 0) + 1;
  const delay = retryDelayMs(attempt);
  job.nextRetryAt = Date.now() + delay;
  job.error = `${interruptMessage(job.errorCode)} Retrying in ${Math.max(1, Math.round(delay / 1000))}s.`;
  void chrome.alarms.create(RETRY_PREFIX + job.id, { when: job.nextRetryAt });
}

/** A job reached a final state (or a failure that can be retried). Record it exactly once. */
async function settle(job: DownloadJob): Promise<void> {
  if (job.state === "complete") {
    speeds.delete(job.id);
    await recordHistory(job, true);
    return;
  }
  if (job.state !== "interrupted") return;
  if (canRetry(job)) {
    scheduleRetry(job);
    await recordDiagnostic({
      severity: "warn",
      code: job.errorCode ?? "INTERRUPTED",
      message: `Interrupted, will retry (attempt ${(job.attempts ?? 0) + 1}).`,
      host: originHost(job.url),
    });
    return;
  }
  speeds.delete(job.id);
  job.nextRetryAt = undefined;
  await recordHistory(job, false, job.error);
  await recordDiagnostic({
    severity: "error",
    code: job.errorCode ?? "INTERRUPTED",
    message: job.error ?? "Download interrupted.",
    host: originHost(job.url),
  });
}

async function startPageJob(job: DownloadJob): Promise<void> {
  try {
    if (job.tabId == null) throw new Error("no tab");
    job.state = "in_progress";
    job.startedAt = Date.now();
    job.lastAt = job.startedAt;
    job.lastBytes = undefined;
    job.error = undefined;
    job.errorCode = undefined;
    job.nextRetryAt = undefined;
    job.blobUrl = undefined;
    job.percent = 0;
    const prefs = await loadPrefs();
    await chrome.tabs.sendMessage(job.tabId, {
      type: "HLS_RUN",
      jobId: job.id,
      url: job.url,
      filename: job.filename,
      prefs,
    } satisfies RuntimeMessage);
    await persist();
  } catch {
    job.state = "interrupted";
    job.errorCode = "START_FAILED";
    job.error = "Could not reach the page. Reload it, then try again.";
    broadcast({ type: "DOWNLOAD_ERROR", message: job.error });
    await settle(job);
    await persist();
  }
}

async function startJob(job: DownloadJob): Promise<void> {
  if (job.engine === "page") return startPageJob(job);
  try {
    job.state = "in_progress";
    job.startedAt = Date.now();
    job.lastBytes = undefined;
    job.lastAt = undefined;
    job.error = undefined;
    job.errorCode = undefined;
    job.nextRetryAt = undefined;
    const chromeId = await startChromeDownload(job);
    job.chromeDownloadId = chromeId;
    byChromeId.set(chromeId, job.id);
    await persist();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Download failed.";
    job.state = "interrupted";
    job.errorCode = /network|timeout|disconnect/i.test(message) ? "NETWORK_FAILED" : "START_FAILED";
    job.error = /forbidden|unauthorized|cors/i.test(message)
      ? "Could not start the download. The URL may require a session cookie or block hotlinking."
      : message;
    broadcast({ type: "DOWNLOAD_ERROR", message: job.error });
    await settle(job);
    await persist();
  }
}

export async function enqueue(input: {
  url: string;
  filename: string;
  title: string;
  quality: string;
  subtitleUrls?: string[];
  authority?: DownloadJob["authority"];
  engine?: DownloadJob["engine"];
  tabId?: number;
}): Promise<DownloadJob> {
  await hydrate();
  const live = [...jobs.values()].find((j) => j.url === input.url && (j.state === "queued" || j.state === "in_progress"));
  if (live) return live;
  const job: DownloadJob = {
    id: crypto.randomUUID(),
    url: input.url,
    filename: input.filename,
    title: input.title,
    quality: input.quality,
    subtitleUrls: input.subtitleUrls,
    authority: input.authority,
    engine: input.engine ?? "browser",
    tabId: input.tabId,
    state: "queued",
    percent: 0,
    createdAt: Date.now(),
    attempts: 0,
  };
  jobs.set(job.id, job);
  await persist();
  await startJob(job);
  return job;
}

/** Called when a retry alarm fires. */
export async function retryJob(jobId: string): Promise<void> {
  await hydrate();
  const job = jobs.get(jobId);
  if (!job || !canRetry(job)) return;
  job.attempts = (job.attempts ?? 0) + 1;
  await startJob(job);
}

export async function onChromeDownloadChanged(delta: chrome.downloads.DownloadDelta): Promise<void> {
  await hydrate();
  if (delta.id == null) return;
  const jobId = byChromeId.get(delta.id);
  if (!jobId) return;
  const job = jobs.get(jobId);
  if (!job) return;
  const [item] = await chrome.downloads.search({ id: delta.id });
  if (!item) return;

  const now = Date.now();
  const received = item.bytesReceived || 0;
  if (job.lastBytes != null && job.lastAt != null && received > job.lastBytes && now > job.lastAt) {
    speeds.set(job.id, addSpeedSample(speeds.get(job.id), received - job.lastBytes, now - job.lastAt));
  }
  job.lastBytes = received;
  job.lastAt = now;
  job.bytesPerSecond = speeds.get(job.id)?.smoothed ?? undefined;

  const progress = progressFromDelta(item, job.startedAt ?? job.createdAt, job.filename, job.bytesPerSecond, job.id);
  job.percent = progress.percent;
  const terminal = progress.state !== "in_progress";
  if (progress.state === "complete") {
    job.state = "complete";
    job.error = undefined;
    job.errorCode = undefined;
  } else if (progress.state === "interrupted") {
    job.state = "interrupted";
    job.errorCode = item.error || "DOWNLOAD_INTERRUPTED";
    job.error = progress.error;
  }

  if (terminal) {
    byChromeId.delete(delta.id);
    await settle(job);
    if (job.state === "interrupted") progress.error = job.error;
  }
  broadcast({ type: "DOWNLOAD_PROGRESS", progress });
  await persist();
}

// ---- Page engine (HLS segments joined by the content script) -------------------------------------------

const pageIds = new Map<string, number>();
let pageIdSeq = 0;
const lastPersist = new Map<string, number>();

function pageDownloadId(jobId: string): number {
  let id = pageIds.get(jobId);
  if (id === undefined) {
    pageIdSeq -= 1;
    id = pageIdSeq;
    pageIds.set(jobId, id);
  }
  return id;
}

async function pageJob(jobId: string, tabId: number | undefined): Promise<DownloadJob | undefined> {
  await hydrate();
  const job = jobs.get(jobId);
  if (!job || job.engine !== "page" || (tabId != null && job.tabId !== tabId)) return undefined;
  return job;
}

export async function onHlsProgress(msg: Extract<RuntimeMessage, { type: "HLS_PROGRESS" }>, tabId: number | undefined): Promise<void> {
  const job = await pageJob(msg.jobId, tabId);
  if (!job || job.state !== "in_progress" || job.blobUrl) return;
  const now = Date.now();
  if (job.lastBytes != null && job.lastAt != null && msg.bytes > job.lastBytes && now > job.lastAt) {
    speeds.set(job.id, addSpeedSample(speeds.get(job.id), msg.bytes - job.lastBytes, now - job.lastAt));
  }
  job.lastBytes = msg.bytes;
  job.lastAt = now;
  job.bytesPerSecond = speeds.get(job.id)?.smoothed ?? undefined;
  job.percent = msg.total > 0 ? Math.min(99, (msg.done / msg.total) * 100) : 0;
  const elapsed = (now - (job.startedAt ?? now)) / 1000;
  const progress: DownloadProgress = {
    jobId: job.id,
    downloadId: pageDownloadId(job.id),
    filename: job.filename,
    percent: job.percent,
    bytesReceived: msg.bytes,
    totalBytes: 0,
    etaSeconds: msg.done > 0 && elapsed > 0.5 ? Math.ceil(((msg.total - msg.done) * elapsed) / msg.done) : null,
    bytesPerSecond: job.bytesPerSecond,
    state: "in_progress",
  };
  broadcast({ type: "DOWNLOAD_PROGRESS", progress });
  if (now - (lastPersist.get(job.id) ?? 0) > 5_000) {
    lastPersist.set(job.id, now);
    await persist();
  }
}

/** The page joined every segment and has a blob URL ready. The browser's own download now takes over. */
export async function onHlsReady(msg: Extract<RuntimeMessage, { type: "HLS_READY" }>, tabId: number | undefined): Promise<"started" | "fallback" | "rejected"> {
  const job = await pageJob(msg.jobId, tabId);
  if (!job || job.state !== "in_progress" || !msg.blobUrl.startsWith("blob:")) return "rejected";
  job.blobUrl = msg.blobUrl;
  job.filename = msg.filename.replace(/\\/g, "/").split("/").pop() || job.filename;
  job.percent = 100;
  job.lastAt = Date.now();
  try {
    // The browser downloads the page's blob directly, which avoids the "download multiple files" prompt.
    const id = await startChromeDownload(job, msg.blobUrl);
    job.chromeDownloadId = id;
    job.startedAt = Date.now();
    job.lastBytes = undefined;
    job.lastAt = undefined;
    byChromeId.set(id, job.id);
    await persist();
    return "started";
  } catch {
    // The page falls back to a normal link click. onDownloadCreated links that download to this job.
    await persist();
    return "fallback";
  }
}

export async function onHlsFailed(msg: Extract<RuntimeMessage, { type: "HLS_FAILED" }>, tabId: number | undefined): Promise<void> {
  const job = await pageJob(msg.jobId, tabId);
  if (!job || job.state === "complete") return;
  job.state = "interrupted";
  job.errorCode = msg.code;
  job.error = String(msg.message).slice(0, 300);
  broadcast({ type: "DOWNLOAD_ERROR", message: job.error });
  const progress: DownloadProgress = {
    jobId: job.id,
    downloadId: pageDownloadId(job.id),
    filename: job.filename,
    percent: job.percent,
    bytesReceived: job.lastBytes ?? 0,
    totalBytes: 0,
    etaSeconds: null,
    state: "interrupted",
  };
  await settle(job);
  progress.error = job.error;
  broadcast({ type: "DOWNLOAD_PROGRESS", progress });
  await persist();
}

/** Link the browser download that carries our blob to its job, so completion and failure are tracked. */
export async function onDownloadCreated(item: chrome.downloads.DownloadItem): Promise<void> {
  if (!item.url.startsWith("blob:")) return;
  await hydrate();
  const job = [...jobs.values()].find((j) => j.blobUrl === item.url);
  if (!job) return;
  job.chromeDownloadId = item.id;
  job.startedAt = Date.now();
  job.lastBytes = undefined;
  job.lastAt = undefined;
  byChromeId.set(item.id, job.id);
  await persist();
}

/** Put our own blob downloads in the user's subfolder with their chosen conflict rule. Other downloads are untouched. */
export function onDeterminingFilename(
  item: chrome.downloads.DownloadItem,
  suggest: (suggestion?: chrome.downloads.FilenameSuggestion) => void,
): boolean {
  if (!item.url.startsWith("blob:")) return false;
  void (async () => {
    await hydrate();
    const job = [...jobs.values()].find((j) => j.blobUrl === item.url);
    if (!job) {
      suggest();
      return;
    }
    const prefs = await loadPrefs();
    const base = job.filename.replace(/\\/g, "/").split("/").pop() || job.filename;
    job.filename = withSubfolder(base, prefs.subfolder);
    suggest({ filename: job.filename, conflictAction: prefs.conflict });
  })();
  return true;
}
/** The tab that was fetching segments is gone, so nothing will ever finish or report. */
export async function onTabClosed(tabId: number): Promise<void> {
  await hydrate();
  let changed = false;
  for (const job of jobs.values()) {
    if (job.engine !== "page" || job.tabId !== tabId || job.state !== "in_progress" || job.blobUrl) continue;
    job.state = "interrupted";
    job.errorCode = "PAGE_CLOSED";
    job.error = "The page was closed before the download finished.";
    await settle(job);
    broadcast({ type: "DOWNLOAD_ERROR", message: job.error });
    changed = true;
  }
  if (changed) await persist();
}
/** Forget every job in memory. Called after all stored data has been erased. */
export async function forgetAllJobs(): Promise<void> {
  jobs.clear();
  byChromeId.clear();
  speeds.clear();
  pageIds.clear();
  lastPersist.clear();
  hydrating = Promise.resolve();
  await chrome.alarms.clearAll();
  broadcast({ type: "QUEUE_UPDATED", jobs: [] });
}