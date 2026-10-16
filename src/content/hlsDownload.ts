import { hlsStreamError } from "../shared/hlsErrors";
import { outputExtension, parseHlsMedia, type HlsMedia, type HlsSegment } from "../shared/hlsMedia";
import { parseHlsPlaylist } from "../shared/parseHls";
import { pickDefaultVariant } from "../shared/quality";
import type { UserPrefs } from "../shared/types";

export { HlsError } from "../shared/hlsErrors";

export type HlsProgress = { done: number; total: number; bytes: number };

export type HlsOptions = {
  fetchFn?: typeof fetch;
  concurrency?: number;
  retries?: number;
  maxBytes?: number;
  signal?: AbortSignal;
  onProgress?: (p: HlsProgress) => void;
  sleep?: (ms: number) => Promise<void>;
  quality?: { preferred: UserPrefs["preferredQuality"]; maxHeight: UserPrefs["maxHeight"]; mode: UserPrefs["qualityMode"] };
};

export type HlsResult = { blob: Blob; ext: "mp4" | "ts" | "aac"; segments: number; bytes: number };

const DEFAULT_MAX_BYTES = 6 * 1024 ** 3;
/** A playlist is text. These limits stop a hostile or broken one from exhausting memory. */
const MAX_PLAYLIST_CHARS = 20_000_000;
const MAX_PARTS = 60_000;

/** Playlists are untrusted input: only plain web addresses are ever fetched (no blob:, data:, file:, javascript:). */
function assertWebUrl(url: string): void {
  let protocol = "";
  try {
    protocol = new URL(url).protocol;
  } catch {
    /* falls through */
  }
  if (protocol !== "http:" && protocol !== "https:") {
    throw hlsStreamError("EMPTY", "The playlist points at an address that is not a web address, so it was not fetched.");
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch every segment of a clear (unencrypted, non-live) HLS stream from the page and join them in order.
 * Runs in the page so the site's own cookies and CORS rules apply, exactly as for its player.
 * Encrypted streams are refused before a single segment is requested.
 */
export async function downloadHls(playlistUrl: string, opts: HlsOptions = {}): Promise<HlsResult> {
  const doFetch = opts.fetchFn ?? ((input, init) => fetch(input, init));
  const sleep = opts.sleep ?? wait;
  const retries = opts.retries ?? 2;
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;

  const getText = async (url: string): Promise<string> => {
    assertWebUrl(url);
    let res: Response;
    try {
      res = await doFetch(url, { credentials: "include", signal: opts.signal });
    } catch {
      throw hlsStreamError("NETWORK", "Could not read the playlist from this page (CORS or network).");
    }
    if (res.status === 401 || res.status === 403) throw hlsStreamError("FORBIDDEN", `The stream needs a login or is blocked (HTTP ${res.status}).`);
    if (!res.ok) throw hlsStreamError("NETWORK", `Playlist request failed (${res.status}).`);
    const body = await res.text();
    if (body.length > MAX_PLAYLIST_CHARS) throw hlsStreamError("EMPTY", "The playlist is far larger than any real one, so it was not used.");
    return body;
  };

  let url = playlistUrl;
  let text = await getText(url);
  let media: HlsMedia = parseHlsMedia(text, url);

  if (media.isMaster) {
    const master = parseHlsPlaylist(text, url);
    if (master.encrypted) throw hlsStreamError("ENCRYPTED", "This stream is encrypted. KUI Video Extractor does not decrypt streams.");
    const q = opts.quality ?? { preferred: "auto" as const, maxHeight: "auto" as const, mode: "balanced" as const };
    const chosen = pickDefaultVariant(
      master.variants.filter((v) => v.kind === "hls"),
      q.preferred,
      q.maxHeight,
      q.mode,
    );
    if (!chosen) throw hlsStreamError("EMPTY", "No downloadable quality was found in this stream.");
    url = chosen.url;
    text = await getText(url);
    media = parseHlsMedia(text, url);
    if (media.isMaster) throw hlsStreamError("EMPTY", "The stream points to another master playlist.");
  }

  if (media.encrypted) throw hlsStreamError("ENCRYPTED", "This stream is encrypted. KUI Video Extractor does not decrypt streams.");
  if (media.live) throw hlsStreamError("LIVE", "This is a live stream that has not ended, so there is no finished file to save.");
  if (!media.segments.length) throw hlsStreamError("EMPTY", "The playlist lists no segments.");

  const parts: HlsSegment[] = media.map ? [media.map, ...media.segments] : media.segments;
  if (parts.length > MAX_PARTS) throw hlsStreamError("TOO_LARGE", "The playlist lists more segments than is sensible to join in the browser. Use the command panel.");
  for (const part of parts) assertWebUrl(part.url);
  const blobs: Blob[] = new Array(parts.length);
  let done = 0;
  let bytes = 0;
  let next = 0;
  let failure: unknown;

  const fetchPart = async (part: HlsSegment): Promise<Blob> => {
    let lastError: unknown;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      if (opts.signal?.aborted) throw hlsStreamError("ABORTED", "The download was cancelled.");
      try {
        const res = await doFetch(part.url, {
          credentials: "include",
          signal: opts.signal,
          headers: part.range ? { Range: part.range } : undefined,
        });
        if (res.status === 401 || res.status === 403) throw hlsStreamError("FORBIDDEN", `A segment was refused (HTTP ${res.status}).`);
        if (!res.ok && res.status !== 206) throw new Error(`HTTP ${res.status}`);
        return await res.blob();
      } catch (err) {
        if (err instanceof Error && err.name === "HlsError") throw err;
        lastError = err;
        if (attempt < retries) await sleep(300 * (attempt + 1));
      }
    }
    throw hlsStreamError("NETWORK", `A segment could not be fetched after ${retries + 1} tries${lastError instanceof Error ? ` (${lastError.message})` : ""}.`);
  };

  const worker = async (): Promise<void> => {
    while (failure === undefined) {
      const index = next;
      next += 1;
      if (index >= parts.length) return;
      try {
        const blob = await fetchPart(parts[index] as HlsSegment);
        blobs[index] = blob;
        bytes += blob.size;
        done += 1;
        if (bytes > maxBytes) throw hlsStreamError("TOO_LARGE", "The video is larger than the in-browser limit. Use the command panel instead.");
        opts.onProgress?.({ done, total: parts.length, bytes });
      } catch (err) {
        failure ??= err;
        return;
      }
    }
  };

  await Promise.all(Array.from({ length: Math.max(1, Math.min(opts.concurrency ?? 4, parts.length)) }, () => worker()));
  if (failure !== undefined) throw failure;

  const ext = outputExtension(media);
  const type = ext === "mp4" ? "video/mp4" : ext === "aac" ? "audio/aac" : "video/mp2t";
  return { blob: new Blob(blobs, { type }), ext, segments: media.segments.length, bytes };
}

/** Replace the file extension with the one the joined segments actually use. */
export function withExtension(filename: string, ext: string): string {
  return /\.[a-z0-9]{2,4}$/i.test(filename) ? filename.replace(/\.[a-z0-9]{2,4}$/i, `.${ext}`) : `${filename}.${ext}`;
}
