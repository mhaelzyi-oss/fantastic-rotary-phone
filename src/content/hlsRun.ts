import { hlsCodeToJobCode } from "../shared/hlsErrors";
import type { RuntimeMessage } from "../shared/messages";
import type { UserPrefs } from "../shared/types";
import { downloadHls, HlsError, withExtension } from "./hlsDownload";

const PROGRESS_MS = 400;
const BLOB_LIFETIME_MS = 15 * 60_000;

const running = new Map<string, AbortController>();

function send(message: RuntimeMessage): Promise<unknown> {
  return chrome.runtime.sendMessage(message).catch(() => undefined);
}

/** Fallback when the browser could not take the blob directly: click a link, like a normal download. */
function clickDownload(blobUrl: string, filename: string): void {
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = filename;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/**
 * Download an HLS stream inside the page. The page's own cookies, referer and CORS rules apply,
 * so anything the player can fetch can be saved. Encrypted and live streams are refused before any segment is read.
 */
export async function runHlsJob(jobId: string, url: string, filename: string, prefs: UserPrefs): Promise<void> {
  if (running.has(jobId)) return;
  const ctrl = new AbortController();
  running.set(jobId, ctrl);
  let lastSent = 0;
  try {
    const result = await downloadHls(url, {
      signal: ctrl.signal,
      quality: { preferred: prefs.preferredQuality, maxHeight: prefs.maxHeight, mode: prefs.qualityMode },
      onProgress: (p) => {
        const now = Date.now();
        if (now - lastSent < PROGRESS_MS && p.done < p.total) return;
        lastSent = now;
        void send({ type: "HLS_PROGRESS", jobId, done: p.done, total: p.total, bytes: p.bytes });
      },
    });
    const name = withExtension(filename, result.ext);
    const blobUrl = URL.createObjectURL(result.blob);
    window.setTimeout(() => URL.revokeObjectURL(blobUrl), BLOB_LIFETIME_MS);
    const reply = (await send({ type: "HLS_READY", jobId, blobUrl, filename: name, bytes: result.bytes })) as
      | { result?: "started" | "fallback" | "rejected" }
      | undefined;
    if (reply?.result === "fallback") clickDownload(blobUrl, name);
    if (!reply || reply.result === "rejected") URL.revokeObjectURL(blobUrl);
  } catch (err) {
    const code = err instanceof HlsError ? hlsCodeToJobCode(err.code) : "NETWORK_FAILED";
    const message = err instanceof Error ? err.message : "The stream could not be downloaded.";
    await send({ type: "HLS_FAILED", jobId, code, message });
  } finally {
    running.delete(jobId);
  }
}

export function cancelHlsJob(jobId: string): void {
  running.get(jobId)?.abort();
}
