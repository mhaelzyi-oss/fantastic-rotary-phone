import type { RuntimeMessage, StartResult } from "../shared/messages";
import { toLibraryItem, addToLibrary } from "../shared/library";
import { checkDownloadRequest } from "../shared/trust";
import type { LibraryItem } from "../shared/types";
import { hostLooksDrm, originHost } from "../shared/url";
import { broadcast } from "./downloads";
import { enqueue, knownJobUrls } from "./queue";
import { loadHistory, loadLibrary, loadPrefs, recordDiagnostic, updateLibrary } from "./storage";
import { allScans, findTabForUrl } from "./tabs";

/** Only the extension's own pages (popup, side panel, options) may change state. Web pages and content scripts may not. */
export function fromExtensionPage(sender: chrome.runtime.MessageSender): boolean {
  if (sender.id !== chrome.runtime.id) return false;
  const prefix = `chrome-extension://${chrome.runtime.id}/`;
  return typeof sender.url === "string" && sender.url.startsWith(prefix);
}

export async function handleStart(raw: Extract<RuntimeMessage, { type: "START_DOWNLOAD" }>): Promise<StartResult> {
  const [prefs, scans, history, library, jobUrls] = await Promise.all([
    loadPrefs(),
    allScans(),
    loadHistory(),
    loadLibrary(),
    knownJobUrls(),
  ]);
  const verdict = checkDownloadRequest(raw, {
    sources: scans.flatMap((s) => s.sources),
    knownUrls: new Set([...jobUrls, ...history.map((h) => h.url), ...library.map((l) => l.url)]),
    requireAuthority: prefs.requireAuthority,
  });
  if (!verdict.ok) {
    await recordDiagnostic({ severity: "warn", code: verdict.code, message: verdict.error, host: originHost(String(raw.url)) });
    broadcast({ type: "DOWNLOAD_ERROR", message: verdict.error });
    return { ok: false, error: verdict.error, code: verdict.code };
  }
  // A playlist is not a video file. The page joins its segments, so the page must still be open.
  let tabId: number | undefined;
  if (verdict.kind === "dash") {
    const error = "DASH streams keep audio and video apart, so they cannot be saved here. Use the Command panel to copy a yt-dlp or ffmpeg command.";
    await recordDiagnostic({ severity: "info", code: "DASH_UNSUPPORTED", message: error, host: originHost(raw.url) });
    broadcast({ type: "DOWNLOAD_ERROR", message: error });
    return { ok: false, error, code: "DASH_UNSUPPORTED" };
  }
  if (verdict.kind === "hls") {
    tabId = await findTabForUrl(raw.url);
    if (tabId == null) {
      const error = "Open the page that plays this stream, then try again. The page is needed to fetch the segments.";
      await recordDiagnostic({ severity: "warn", code: "NO_PAGE", message: error, host: originHost(raw.url) });
      broadcast({ type: "DOWNLOAD_ERROR", message: error });
      return { ok: false, error, code: "NO_PAGE" };
    }
  }
  const job = await enqueue({
    engine: verdict.kind === "hls" ? "page" : "browser",
    tabId,
    url: raw.url,
    filename: verdict.filename,
    title: String(raw.title ?? "video").slice(0, 200),
    quality: String(raw.quality ?? "source").slice(0, 40),
    subtitleUrls: verdict.subtitleUrls,
    authority: verdict.authority,
  });
  return { ok: true, jobId: job.id };
}

/** Add a detected, non-protected source to the library. The details come from our own scan, not from the caller. */
export async function handleAddLibrary(url: string): Promise<{ ok: boolean; error?: string; items?: LibraryItem[] }> {
  const scans = await allScans();
  const matches = scans.flatMap((s) => s.sources).filter((s) => s.url === url);
  const source = matches[0];
  if (!source) return { ok: false, error: "That stream is no longer on the page. Rescan first." };
  if (matches.some((m) => m.encrypted || hostLooksDrm(m.pageUrl))) {
    return { ok: false, error: "Protected streams cannot be saved to the library." };
  }
  const items = await updateLibrary((list) => addToLibrary(list, toLibraryItem(source)));
  return { ok: true, items };
}
