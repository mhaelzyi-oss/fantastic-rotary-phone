import { parseAttrs } from "./parseHls";
import { resolveUri } from "./url";

export type HlsSegment = { url: string; /** HTTP Range value such as "bytes=0-999" */ range?: string };

export type HlsMedia = {
  isMaster: boolean;
  segments: HlsSegment[];
  /** Initialisation segment of a fragmented MP4 stream. */
  map?: HlsSegment;
  /** Any EXT-X-KEY other than METHOD=NONE. Such streams are never downloaded. */
  encrypted: boolean;
  /** No end tag: the playlist keeps growing. */
  live: boolean;
  durationSec: number;
};

function parseRange(value: string, prevEnd: number): { header: string; end: number } | null {
  const [lenText, offText] = value.split("@");
  const len = Number.parseInt(lenText ?? "", 10);
  if (!Number.isFinite(len) || len <= 0) return null;
  const start = offText !== undefined ? Number.parseInt(offText, 10) : prevEnd;
  if (!Number.isFinite(start) || start < 0) return null;
  return { header: `bytes=${start}-${start + len - 1}`, end: start + len };
}

/** Read the parts of an HLS media playlist needed to fetch every segment in order. */
export function parseHlsMedia(text: string, playlistUrl: string): HlsMedia {
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const isMaster = lines.some((l) => l.startsWith("#EXT-X-STREAM-INF:"));
  const segments: HlsSegment[] = [];
  let map: HlsSegment | undefined;
  let encrypted = false;
  let ended = false;
  let vod = false;
  let duration = 0;
  let pendingRange: string | undefined;
  let prevEnd = 0;
  let afterInf = false;

  for (const line of lines) {
    if (!line) continue;
    if (line.startsWith("#EXT-X-KEY:") || line.startsWith("#EXT-X-SESSION-KEY:")) {
      const method = parseAttrs(line.slice(line.indexOf(":") + 1)).METHOD ?? "";
      if (method && method !== "NONE") encrypted = true;
    } else if (line.startsWith("#EXT-X-MAP:")) {
      const attrs = parseAttrs(line.slice("#EXT-X-MAP:".length));
      if (attrs.URI) {
        let range: string | undefined;
        if (attrs.BYTERANGE) {
          const r = parseRange(attrs.BYTERANGE, 0);
          range = r?.header;
        }
        map = { url: resolveUri(playlistUrl, attrs.URI), range };
      }
    } else if (line.startsWith("#EXT-X-ENDLIST")) {
      ended = true;
    } else if (line.startsWith("#EXT-X-PLAYLIST-TYPE:")) {
      vod = line.slice("#EXT-X-PLAYLIST-TYPE:".length).trim().toUpperCase() === "VOD";
    } else if (line.startsWith("#EXTINF:")) {
      const n = Number.parseFloat(line.slice("#EXTINF:".length).split(",")[0] ?? "");
      if (Number.isFinite(n)) duration += n;
      afterInf = true;
    } else if (line.startsWith("#EXT-X-BYTERANGE:")) {
      const r = parseRange(line.slice("#EXT-X-BYTERANGE:".length).trim(), prevEnd);
      if (r) {
        pendingRange = r.header;
        prevEnd = r.end;
      }
    } else if (!line.startsWith("#") && afterInf) {
      segments.push({ url: resolveUri(playlistUrl, line), range: pendingRange });
      pendingRange = undefined;
      afterInf = false;
    }
  }

  return { isMaster, segments, map, encrypted, live: !ended && !vod, durationSec: duration };
}

/** File extension for the joined segments. Fragmented MP4 stays mp4; transport streams are saved as ts. */
export function outputExtension(media: HlsMedia): "mp4" | "ts" | "aac" {
  if (media.map) return "mp4";
  const first = media.segments[0]?.url ?? "";
  let path = first;
  try {
    path = new URL(first).pathname;
  } catch {
    /* raw */
  }
  if (/\.(aac|m4a)$/i.test(path)) return "aac";
  if (/\.(mp4|m4s|m4v|cmfv)$/i.test(path)) return "mp4";
  return "ts";
}
