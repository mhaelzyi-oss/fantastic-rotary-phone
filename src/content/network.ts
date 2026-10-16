import { fileNameFromDisposition, isMediaMime, isSegmentUrl, looksLikeVideo } from "../shared/url";

/**
 * Media the page loaded through scripts (fetch, XHR, players) rather than putting a URL in the HTML.
 * Two sources feed this list:
 *   1. The browser's own resource timeline, which needs no permission and lists every request.
 *   2. Response types reported by `hook.ts`, which runs in the page, for URLs with no file extension.
 */
export type NetworkHit = { url: string; mime?: string; bytes?: number; fileName?: string };

const MAX_HITS = 200;
const hits = new Map<string, NetworkHit>();

export function recordNetworkMedia(
  url: string,
  mime?: string,
  meta?: { bytes?: number; fileName?: string },
): boolean {
  if (!/^https?:/i.test(url) || isSegmentUrl(url)) return false;
  const typed = isMediaMime(mime);
  if (!typed && !looksLikeVideo(url)) return false;
  const prev = hits.get(url);
  if (prev) {
    let changed = false;
    if (meta?.bytes && !prev.bytes) {
      prev.bytes = meta.bytes;
      changed = true;
    }
    if (meta?.fileName && !prev.fileName) {
      prev.fileName = meta.fileName;
      changed = true;
    }
    if (typed && mime && !prev.mime) {
      prev.mime = mime;
      changed = true;
    }
    return changed;
  }
  if (hits.size >= MAX_HITS) {
    const oldest = hits.keys().next().value;
    if (oldest !== undefined) hits.delete(oldest);
  }
  hits.set(url, { url, mime: typed ? mime : undefined, bytes: meta?.bytes, fileName: meta?.fileName });
  return true;
}

export function networkHits(): NetworkHit[] {
  return [...hits.values()];
}

export function resetNetworkHits(): void {
  hits.clear();
}

type HookMessage = { source: "vpf-hook"; url: string; mime?: string; bytes?: number; disposition?: string };

function isHookMessage(data: unknown): data is HookMessage {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  const bytesOk = d.bytes === undefined || (typeof d.bytes === "number" && d.bytes > 0 && d.bytes < 1e15);
  const nameOk = d.disposition === undefined || (typeof d.disposition === "string" && d.disposition.length < 400);
  return d.source === "vpf-hook" && typeof d.url === "string" && d.url.length < 4000 && (d.mime === undefined || typeof d.mime === "string") && bytesOk && nameOk;
}

/** Start listening. `onNew` runs when a URL we had not seen shows up. */
export function startNetworkWatch(onNew: () => void): () => void {
  const stops: (() => void)[] = [];

  if (typeof PerformanceObserver !== "undefined") {
    const feed = (entries: PerformanceEntryList) => {
      let found = false;
      for (const entry of entries) {
        const timing = entry as PerformanceResourceTiming;
        const mime = timing.initiatorType === "video" ? "video/mp4" : timing.initiatorType === "audio" ? "audio/mpeg" : undefined;
        const bytes = timing.encodedBodySize > 0 ? timing.encodedBodySize : undefined;
        if (recordNetworkMedia(timing.name, mime, { bytes })) found = true;
      }
      if (found) onNew();
    };
    feed(performance.getEntriesByType("resource"));
    try {
      const observer = new PerformanceObserver((list) => feed(list.getEntries()));
      observer.observe({ type: "resource", buffered: false });
      stops.push(() => observer.disconnect());
    } catch {
      /* resource timing unavailable */
    }
  }

  const onMessage = (event: MessageEvent) => {
    if (event.source !== window || !isHookMessage(event.data)) return;
    const fileName = event.data.disposition ? fileNameFromDisposition(event.data.disposition) : undefined;
    if (recordNetworkMedia(event.data.url, event.data.mime, { bytes: event.data.bytes, fileName })) onNew();
  };
  window.addEventListener("message", onMessage);
  stops.push(() => window.removeEventListener("message", onMessage));
  // Ask the page-world hook to repeat what it saw before this script was running.
  try {
    window.postMessage({ source: "vpf-content", type: "replay" }, window.location.origin);
  } catch {
    /* opaque origin */
  }

  return () => stops.forEach((stop) => stop());
}
