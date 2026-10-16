import type { QualityVariant } from "./types";
import { resolveUri } from "./url";

export type ParsedDash = {
  variants: QualityVariant[];
  encrypted: boolean;
};

/**
 * Lightweight DASH MPD parser for video Representation + BaseURL.
 * Flags ContentProtection as encrypted; does not unwrap CENC/DRM.
 */
export function parseDashMpd(xml: string, manifestUrl: string): ParsedDash {
  const encrypted = /<ContentProtection[\s>]/i.test(xml);
  const variants: QualityVariant[] = [];
  const setRe = /<AdaptationSet\b([^>]*)>([\s\S]*?)<\/AdaptationSet>/gi;
  let setMatch: RegExpExecArray | null;
  while ((setMatch = setRe.exec(xml))) {
    const setAttrs = parseXmlAttrs(setMatch[1]);
    const setMime = (setAttrs.mimeType ?? setAttrs.contentType ?? "").toLowerCase();
    if (setMime.startsWith("audio") || setMime.startsWith("text")) continue;
    const re = /<Representation\b([^>]*)>([\s\S]*?)<\/Representation>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(setMatch[2]))) {
      const attrs = parseXmlAttrs(m[1]);
      const mime = (attrs.mimeType ?? setMime).toLowerCase();
      if (mime.startsWith("audio") || mime.startsWith("text")) continue;
      const inner = m[2];
      const baseMatch = inner.match(/<BaseURL[^>]*>([^<]+)<\/BaseURL>/i);
      const href = (baseMatch?.[1] ?? attrs.id ?? "").trim();
      if (!href && !manifestUrl) continue;
      const url = href ? resolveUri(manifestUrl, href) : manifestUrl;
      const width = num(attrs.width);
      const height = num(attrs.height);
      const bandwidth = num(attrs.bandwidth);
      variants.push({
        url,
        label: height ? `${height}p` : bandwidth ? `${Math.round(bandwidth / 1000)}kbps` : "DASH",
        width,
        height,
        bandwidth,
        codecs: attrs.codecs,
        encrypted,
        kind: url.toLowerCase().includes(".mpd") ? "dash" : "progressive",
      });
    }
  }

  if (!variants.length) {
    variants.push({
      url: manifestUrl,
      label: "DASH",
      encrypted,
      kind: "dash",
    });
  }

  return { variants, encrypted };
}

/** Parse XML attribute string into a map (names kept as-is). */
export function parseXmlAttrs(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([:@A-Za-z_][\w:.-]*)="([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    out[m[1]] = m[2];
  }
  return out;
}

function num(value?: string): number | undefined {
  if (!value) return undefined;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : undefined;
}
