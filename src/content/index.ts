import { debounce } from "../shared/debounce";
import { hostAllowed } from "../shared/hosts";
import type { RuntimeMessage } from "../shared/messages";
import { parseDashMpd } from "../shared/parseDash";
import { parseHlsPlaylist } from "../shared/parseHls";
import { estimateSizeBytes } from "../shared/quality";
import type { MediaItem, ScanPayload, UserPrefs } from "../shared/types";
import { hostLooksDrm } from "../shared/url";
import { collectCandidateUrls, hasBlobPlayback, toStubSource } from "./detect";
import { runHlsJob } from "./hlsRun";
import { startNetworkWatch } from "./network";

const MAX_PLAYLISTS = 5;
const FETCH_MS = 2500;
const SCAN_DEBOUNCE_MS = 900;

declare global {
  interface Window {
    __VPF_INSTALLED__?: boolean;
    __VPF_SCAN_KEY__?: string;
  }
}

async function fetchText(url: string): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), FETCH_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal, credentials: "include" });
    if (res.status === 401 || res.status === 403) {
      return { ok: false, error: "This stream needs a login or is blocked (HTTP " + res.status + ")." };
    }
    if (!res.ok) return { ok: false, error: `Playlist request failed (${res.status}).` };
    return { ok: true, text: await res.text() };
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    if (name === "AbortError") return { ok: false, error: "Timed out while reading the playlist." };
    return {
      ok: false,
      error: "Could not read the playlist from this page (CORS or network). Try a direct MP4 if one is listed.",
    };
  } finally {
    window.clearTimeout(timer);
  }
}

export async function enrichSources(stubs: MediaItem[]): Promise<{ sources: MediaItem[]; error?: string }> {
  const progressive = stubs.filter((s) => s.kind === "progressive" || s.encrypted);
  const playlists = stubs.filter((s) => s.kind !== "progressive" && !s.encrypted).slice(0, MAX_PLAYLISTS);
  const leftover = stubs.filter((s) => s.kind !== "progressive" && !s.encrypted).slice(MAX_PLAYLISTS);

  const fetched = await Promise.all(
    playlists.map(async (stub) => {
      const result = await fetchText(stub.url);
      if (!result.ok) return { error: result.error, source: stub };
      if (stub.kind === "hls") {
        const parsedHls = parseHlsPlaylist(result.text, stub.url);
        const variants = parsedHls.variants.map((v) => ({
          ...v,
          encrypted: v.encrypted || stub.encrypted || hostLooksDrm(stub.pageUrl),
        }));
        const durationSec = parsedHls.durationSec ?? stub.durationSec;
        const best = variants.find((v) => !v.encrypted) ?? variants[0];
        return {
          source: {
            ...stub,
            encrypted: parsedHls.encrypted || stub.encrypted,
            variants,
            subtitles: [...stub.subtitles, ...parsedHls.subtitles],
            durationSec,
            codec: best?.codecs ?? stub.codec,
            resolution: best?.height ? `${best.width ?? "?"}×${best.height}` : stub.resolution,
            sizeEstimate: estimateSizeBytes(best?.bandwidth, durationSec),
          } satisfies MediaItem,
        };
      }
      const parsedDash = parseDashMpd(result.text, stub.url);
      const variants = parsedDash.variants.map((v) => ({
        ...v,
        encrypted: v.encrypted || stub.encrypted,
      }));
      const best = variants.find((v) => !v.encrypted) ?? variants[0];
      return {
        source: {
          ...stub,
          encrypted: parsedDash.encrypted || stub.encrypted,
          variants,
          codec: best?.codecs ?? stub.codec,
          resolution: best?.height ? `${best.width ?? "?"}×${best.height}` : stub.resolution,
          sizeEstimate: estimateSizeBytes(best?.bandwidth, stub.durationSec),
        } satisfies MediaItem,
      };
    }),
  );

  return {
    sources: [...progressive, ...fetched.map((f) => f.source), ...leftover],
    error: fetched.find((f) => f.error)?.error,
  };
}

function payloadKey(payload: ScanPayload): string {
  return JSON.stringify({
    pageUrl: payload.pageUrl,
    error: payload.error ?? "",
    blob: Boolean(payload.blobPlayback),
    sources: payload.sources.map((s) => [s.url, s.encrypted, s.byteLength ?? 0, s.sizeEstimate ?? 0, s.fileName ?? "", s.placement ?? "", s.medium ?? "", s.variants.map((v) => v.url)]),
  });
}

async function requestPrefs(): Promise<UserPrefs> {
  return (await chrome.runtime.sendMessage({ type: "GET_PREFS" } satisfies RuntimeMessage)) as UserPrefs;
}

export async function scanPage(prefs?: UserPrefs): Promise<ScanPayload> {
  const pageUrl = location.href;
  const pageTitle = document.title || "video";
  const resolved = prefs ?? (await requestPrefs());
  if (!hostAllowed(pageUrl, resolved.allowHosts, resolved.blockHosts)) {
    return {
      pageUrl,
      pageTitle,
      sources: [],
      error: "This site is blocked in KUI Video Extractor settings.",
    };
  }
  const stubs = collectCandidateUrls(resolved.scan)
    .map((item) => toStubSource(item, pageTitle, pageUrl))
    .filter((s): s is MediaItem => Boolean(s));

  const { sources, error } = await enrichSources(stubs);
  const downloadable = sources.filter((s) => s.variants.some((v) => !v.encrypted) || (s.kind === "progressive" && !s.encrypted));

  return {
    pageUrl,
    pageTitle,
    sources,
    error: downloadable.length ? undefined : error,
    blobPlayback: hasBlobPlayback() || undefined,
  };
}

function emit(payload: ScanPayload, force = false): void {
  const key = payloadKey(payload);
  if (!force && window.__VPF_SCAN_KEY__ === key) return;
  window.__VPF_SCAN_KEY__ = key;
  chrome.runtime.sendMessage({ type: "SCAN_RESULT", payload } satisfies RuntimeMessage).catch(() => undefined);
}

async function runScan(prefs?: UserPrefs, force = false): Promise<void> {
  try {
    emit(await scanPage(prefs), force);
  } catch {
    emit({ pageUrl: location.href, pageTitle: document.title, sources: [], error: "Scan failed on this page." }, force);
  }
}

const runDebounced = debounce(() => {
  void runScan();
}, SCAN_DEBOUNCE_MS);

function install(): void {
  if (window.__VPF_INSTALLED__) return;
  window.__VPF_INSTALLED__ = true;
  startNetworkWatch(() => runDebounced());
  void runScan();
  const observer = new MutationObserver(() => runDebounced());
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["src", "hidden", "style", "class"],
  });
}

chrome.runtime.onMessage.addListener((message: RuntimeMessage, sender, sendResponse) => {
  // Only this extension's own background may drive the page. Nothing a web page says can reach this listener,
  // but the check keeps it true if another extension or a future setting ever opens a channel.
  if (sender.id && sender.id !== chrome.runtime.id) return false;
  if (message.type === "SCAN_PAGE") {
    void scanPage(message.prefs).then((payload) => {
      emit(payload, true);
      sendResponse(payload);
    });
    return true;
  }
  if (message.type === "HLS_RUN") {
    void runHlsJob(message.jobId, message.url, message.filename, message.prefs);
    sendResponse({ ok: true });
    return false;
  }
  if (message.type === "RESAN" || message.type === "GET_SCAN") {
    void scanPage().then((payload) => {
      emit(payload, message.type === "RESAN");
      sendResponse(payload);
    });
    return true;
  }
  return false;
});

install();
