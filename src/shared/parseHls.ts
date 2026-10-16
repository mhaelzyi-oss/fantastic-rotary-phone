import type { QualityVariant, SubtitleTrack } from "./types";
import { resolveUri } from "./url";

export type ParsedHls = {
  variants: QualityVariant[];
  subtitles: SubtitleTrack[];
  encrypted: boolean;
  durationSec?: number;
};

/**
 * Parse an HLS master or media playlist.
 * Does not decrypt AES-128 or SAMPLE-AES keys — encrypted variants are flagged only.
 */
export function parseHlsPlaylist(text: string, playlistUrl: string): ParsedHls {
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const variants: QualityVariant[] = [];
  const subtitles: SubtitleTrack[] = [];
  let encrypted = false;
  let durationSec = 0;
  let pendingInf: Record<string, string> | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;

    if (line.startsWith("#EXT-X-KEY:") || line.startsWith("#EXT-X-SESSION-KEY:")) {
      const method = attr(line, "METHOD") ?? "";
      if (method && method !== "NONE") encrypted = true;
    }

    if (line.startsWith("#EXT-X-MEDIA:")) {
      const type = attr(line, "TYPE");
      const uri = attr(line, "URI");
      if (type === "SUBTITLES" && uri) {
        subtitles.push({
          url: resolveUri(playlistUrl, uri),
          label: attr(line, "NAME") ?? attr(line, "LANGUAGE") ?? "subtitles",
          language: attr(line, "LANGUAGE"),
        });
      }
    }

    if (line.startsWith("#EXT-X-STREAM-INF:")) {
      pendingInf = parseAttrs(line.slice("#EXT-X-STREAM-INF:".length));
      continue;
    }

    if (line.startsWith("#EXTINF:")) {
      const n = Number.parseFloat(line.slice("#EXTINF:".length).split(",")[0] ?? "");
      if (Number.isFinite(n)) durationSec += n;
    }

    if (line.startsWith("#")) continue;

    if (pendingInf) {
      const { width, height } = parseResolution(pendingInf.RESOLUTION);
      const bandwidth = Number.parseInt(pendingInf.BANDWIDTH ?? "", 10);
      variants.push({
        url: resolveUri(playlistUrl, line),
        label: heightLabel(height, bandwidth),
        height,
        width,
        bandwidth: Number.isFinite(bandwidth) ? bandwidth : undefined,
        codecs: pendingInf.CODECS,
        encrypted,
        kind: line.toLowerCase().includes(".m3u8") ? "hls" : "progressive",
      });
      pendingInf = null;
    }
  }

  if (!variants.length) {
    variants.push({
      url: playlistUrl,
      label: "Source",
      encrypted,
      kind: "hls",
    });
  }

  return {
    variants,
    subtitles,
    encrypted,
    durationSec: durationSec > 0 ? durationSec : undefined,
  };
}

/** Parse KEY=VALUE,KEY2="quoted" attribute lists used in HLS tags. */
export function parseAttrs(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([A-Z0-9-]+)=("(?:[^"]*)"|[^,]*)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    const key = m[1].toUpperCase();
    let value = m[2];
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    out[key] = value;
  }
  return out;
}

function attr(line: string, name: string): string | undefined {
  const idx = line.indexOf(":");
  const parsed = parseAttrs(idx >= 0 ? line.slice(idx + 1) : line);
  return parsed[name];
}

function parseResolution(value?: string): { width?: number; height?: number } {
  if (!value || !value.includes("x")) return {};
  const [w, h] = value.split("x").map((n) => Number.parseInt(n, 10));
  return {
    width: Number.isFinite(w) ? w : undefined,
    height: Number.isFinite(h) ? h : undefined,
  };
}

function heightLabel(height: number | undefined, bandwidth: number): string {
  if (height) return `${height}p`;
  if (Number.isFinite(bandwidth) && bandwidth > 0) return `${Math.round(bandwidth / 1000)}kbps`;
  return "Auto";
}
