import type { VideoKind } from "./types";
import { DRM_HOST_HINTS } from "./types";

const AUDIO_EXT = /\.(mp3|m4a|aac|ogg|opus|wav|flac|weba)(\?|$)/i;
const VIDEO_EXT = /\.(mp4|webm|mkv|mov|m4v|ogv)(\?|$)/i;
const QUERY_EXT = /[?&](?:format|ext)=(mp4|webm|m3u8|mpd|mp3|m4a|aac)\b/i;

function withoutFragment(url: string): string {
  const hash = url.indexOf("#");
  return hash === -1 ? url : url.slice(0, hash);
}

function queryExt(url: string): string | undefined {
  return QUERY_EXT.exec(withoutFragment(url))?.[1].toLowerCase();
}

/** Classify a URL or MIME as progressive file, HLS, or DASH. Audio files count as progressive. */
export function classifyUrl(url: string, contentType = ""): VideoKind | null {
  const type = contentType.toLowerCase();
  const bare = withoutFragment(url);
  if (type.includes("mpegurl") || /\.m3u8(\?|$)/i.test(bare)) return "hls";
  if (type.includes("dash+xml") || /\.mpd(\?|$)/i.test(bare)) return "dash";
  if (AUDIO_EXT.test(bare) || (type.startsWith("audio/") && !type.includes("mpegurl"))) return "progressive";
  if (VIDEO_EXT.test(bare) || type.startsWith("video/")) return "progressive";
  const hinted = queryExt(bare);
  if (hinted === "m3u8") return "hls";
  if (hinted === "mpd") return "dash";
  if (hinted) return "progressive";
  const lower = bare.toLowerCase();
  if (lower.includes("mpegurl")) return "hls";
  if (lower.includes("dash+xml")) return "dash";
  return null;
}

/** True for a response type that carries video, audio, or a stream manifest. */
export function isMediaMime(mime?: string): boolean {
  return /^(video\/|audio\/|application\/(vnd\.apple\.mpegurl|x-mpegurl|dash\+xml))/i.test((mime ?? "").trim());
}

/** Audio when the type or the file name says so. Manifests stay video. */
export function mediaMedium(url: string, contentType = ""): "video" | "audio" {
  const type = contentType.toLowerCase();
  const bare = withoutFragment(url);
  if (type.includes("mpegurl") || type.includes("dash+xml") || /\.(m3u8|mpd)(\?|$)/i.test(bare)) return "video";
  if (type.startsWith("audio/") || AUDIO_EXT.test(bare)) return "audio";
  const hinted = queryExt(bare);
  if (hinted === "mp3" || hinted === "m4a" || hinted === "aac") return "audio";
  return "video";
}

/**
 * Pieces of a segmented stream (not a file you can save on its own).
 * mp3, m4a and aac are whole files unless the file name itself looks like a segment.
 */
export function isSegmentUrl(url: string): boolean {
  let path = url;
  try {
    path = new URL(url).pathname;
  } catch {
    /* use the raw string */
  }
  if (/\.(ts|m4s|cmfv|cmfa)$/i.test(path)) return true;
  if (/(^|[/_-])(segment|chunk|fragment|seg|frag)[-_]?\d*\.(mp4|m4v|mp3|m4a|aac)$/i.test(path)) return true;
  return /\/(init|header)[-_\w]*\.mp4$/i.test(path);
}

export function looksLikeVideo(url: string, contentType = ""): boolean {
  if (!/^https?:/i.test(url)) return false;
  if (/[?&](format|ext)=(mp4|webm|m3u8|mpd|mp3|m4a|aac)\b/i.test(url)) return true;
  return classifyUrl(url, contentType) !== null;
}

/** Pull media URLs out of script/JSON text (hidden or obfuscated in page source). */
export function extractMediaUrlsFromText(text: string, limit = 40): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  const re =
    /https?:\/\/[^\s"'<>\\]{6,800}?\.(?:m3u8|mpd|mp4|webm|m4v|mov|mkv|mp3|m4a|aac|ogg|opus|wav|flac)(?:\?[^\s"'<>\\]*)?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) && found.length < limit) {
    const url = m[0].replace(/[),.;]+$/, "");
    if (seen.has(url) || !looksLikeVideo(url)) continue;
    seen.add(url);
    found.push(url);
  }
  return found;
}

export function hostLooksDrm(pageUrl: string): boolean {
  try {
    const host = new URL(pageUrl).hostname.replace(/^www\./, "");
    return DRM_HOST_HINTS.some((h) => host === h || host.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

export function cleanFileName(name: string): string | undefined {
  const base = name.split(/[/\\]/).pop()?.replace(/[\u0000-\u001f"]/g, "").trim();
  if (!base || base === "." || base === ".." || base.length > 180) return;
  return base;
}

/** Filename from a Content-Disposition header. Path pieces are dropped. */
export function fileNameFromDisposition(header: string): string | undefined {
  const star = /filename\*\s*=\s*"?(?:UTF-8|utf-8)'[^']*'([^";]+)"?/i.exec(header);
  if (star?.[1]) {
    const value = star[1].trim();
    try {
      return cleanFileName(decodeURIComponent(value));
    } catch {
      return cleanFileName(value);
    }
  }
  const quoted = /filename\s*=\s*"([^"]+)"/i.exec(header);
  if (quoted?.[1]) return cleanFileName(quoted[1]);
  const plain = /filename\s*=\s*([^;]+)/i.exec(header);
  if (plain?.[1]) return cleanFileName(plain[1].trim());
  return;
}

export function originHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
}

export function resolveUri(base: string, uri: string): string {
  return new URL(uri.trim(), base).href;
}

export function stripTracking(url: string): string {
  try {
    const u = new URL(url);
    ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"].forEach((p) =>
      u.searchParams.delete(p),
    );
    return u.toString();
  } catch {
    return url;
  }
}
