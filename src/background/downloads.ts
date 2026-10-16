import { estimateEtaSeconds, formatPercent } from "../shared/eta";
import { etaFromSpeed } from "../shared/bandwidth";
import { formatFilename } from "../shared/filename";
import { withSubfolder } from "../shared/history";
import type { RuntimeMessage } from "../shared/messages";
import type { DownloadJob, DownloadProgress, HistoryItem } from "../shared/types";
import { originHost } from "../shared/url";
import { loadPrefs, pushHistory } from "./storage";

export function interruptMessage(reason?: string): string {
  switch (reason) {
    case "SERVER_UNAUTHORIZED":
    case "SERVER_FORBIDDEN":
      return "The server refused the download (login or authorization required).";
    case "NETWORK_FAILED":
    case "NETWORK_TIMEOUT":
    case "NETWORK_DISCONNECTED":
      return "Network failed. The file may be blocked by CORS, mixed content, or an expired URL.";
    case "FILE_ACCESS_DENIED":
      return "Could not write to the Downloads folder.";
    case "SERVER_BAD_CONTENT":
      return "The file was not a valid downloadable video.";
    default:
      return reason ? `Download interrupted (${reason}).` : "Download interrupted.";
  }
}

export function broadcast(message: RuntimeMessage): void {
  chrome.runtime.sendMessage(message).catch(() => undefined);
}

export async function startChromeDownload(job: DownloadJob, urlOverride?: string): Promise<number> {
  const prefs = await loadPrefs();
  const fallback = formatFilename({
    title: job.title,
    quality: job.quality,
    prompt: prefs.prompt,
    host: originHost(job.url),
  });
  // Keep only the last path segment so a retry does not nest the subfolder twice.
  const base = (job.filename || fallback).replace(/\\/g, "/").split("/").pop() || fallback;
  const usedName = withSubfolder(base, prefs.subfolder);
  job.filename = usedName;

  const id = await chrome.downloads.download({
    url: urlOverride ?? job.url,
    filename: usedName,
    saveAs: prefs.saveAs,
    conflictAction: prefs.conflict,
  });

  for (const sub of job.subtitleUrls ?? []) {
    const subName = usedName.replace(/\.[a-z0-9]{2,4}$/i, "") + ".vtt";
    try {
      await chrome.downloads.download({
        url: sub,
        filename: subName,
        saveAs: false,
        conflictAction: prefs.conflict,
      });
    } catch {
      broadcast({
        type: "DOWNLOAD_ERROR",
        message: "Video started, but a subtitle file could not be saved (blocked URL or CORS).",
      });
    }
  }

  return id;
}

export function progressFromDelta(
  item: chrome.downloads.DownloadItem,
  startedAt: number,
  filename: string,
  bytesPerSecond?: number,
  jobId?: string,
): DownloadProgress {
  const elapsed = Date.now() - startedAt;
  const total = item.totalBytes > 0 ? item.totalBytes : item.fileSize || 0;
  const received = item.bytesReceived || 0;
  return {
    jobId,
    downloadId: item.id,
    filename,
    percent: formatPercent(received, total),
    bytesReceived: received,
    totalBytes: total,
    etaSeconds: etaFromSpeed(received, total, bytesPerSecond) ?? estimateEtaSeconds(received, total, elapsed),
    bytesPerSecond,
    state: item.state === "complete" ? "complete" : item.state === "interrupted" ? "interrupted" : "in_progress",
    error: item.error ? interruptMessage(item.error) : undefined,
  };
}

export async function recordHistory(job: DownloadJob, ok: boolean, message?: string): Promise<HistoryItem> {
  const item: HistoryItem = {
    id: job.id,
    title: job.title,
    filename: job.filename,
    url: job.url,
    quality: job.quality,
    at: Date.now(),
    ok,
    message,
  };
  await pushHistory(item);
  if (ok) {
    const prefs = await loadPrefs();
    if (prefs.notifyDone) {
      chrome.notifications
        .create({
          type: "basic",
          iconUrl: "icons/logo-found-48.png",
          title: "KUI Video Extractor",
          message: `Saved ${job.filename}`,
        })
        .catch(() => undefined);
    }
  }
  return item;
}
