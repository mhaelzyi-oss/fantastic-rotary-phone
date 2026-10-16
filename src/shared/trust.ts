import type { MediaItem, VideoKind } from "./types";
import { classifyUrl, hostLooksDrm } from "./url";

export const AUTHORITY_BASES = [
  { id: "owner", label: "I own it" },
  { id: "permission", label: "I have permission" },
  { id: "official_download", label: "The site offers it for download" },
  { id: "public_domain", label: "It is public domain" },
  { id: "compatible_license", label: "It has a licence that allows it" },
] as const;

export type AuthorityBasis = (typeof AUTHORITY_BASES)[number]["id"];

export type DownloadRequest = {
  url: string;
  filename: string;
  subtitleUrls?: string[];
  authority?: { basis: string; confirmed: boolean };
};

export type TrustContext = {
  /** Sources detected in open tabs. */
  sources: MediaItem[];
  /** URLs we already accepted once (history, library). */
  knownUrls: ReadonlySet<string>;
  requireAuthority: boolean;
};

export type Verdict =
  | {
      ok: true;
      filename: string;
      subtitleUrls: string[];
      /** What the URL is: a plain file, an HLS playlist or a DASH manifest. */
      kind: VideoKind;
      authority?: { basis: string; attestedAt: number };
    }
  | { ok: false; code: string; error: string };

/** A download path that stays inside the Downloads folder: no drive letters, no "..", no illegal characters. */
export function safeFilename(input: string): string {
  const parts = input
    .replace(/\\/g, "/")
    .split("/")
    .filter((p) => !/^[A-Za-z]:$/.test(p.trim()))
    .map((p) => p.replace(/[<>:"|?*\u0000-\u001f]/g, "").trim())
    .filter((p) => p && p !== "." && p !== "..");
  const joined = parts.join("/").slice(0, 180);
  return joined || "video.mp4";
}

function isHttp(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Decide in the service worker whether a download request may start. The popup is not trusted to have
 * checked: the URL must have been detected on a page (or accepted before), must not be protected, and
 * the file name is forced back inside Downloads.
 */
export function checkDownloadRequest(req: DownloadRequest, ctx: TrustContext, now: number = Date.now()): Verdict {
  if (!isHttp(req.url)) return { ok: false, code: "INVALID_URL", error: "Only http and https links can be downloaded." };

  const matches = ctx.sources.filter((s) => s.url === req.url || s.variants.some((v) => v.url === req.url));
  const source = matches[0];
  let subtitleUrls: string[] = [];

  if (source) {
    // The same URL seen as protected on any open page counts as protected.
    const locked = matches.some(
      (m) => m.encrypted || m.variants.some((v) => v.url === req.url && v.encrypted) || hostLooksDrm(m.pageUrl),
    );
    if (locked) {
      return { ok: false, code: "DRM", error: "This stream is DRM protected. KUI Video Extractor never unlocks DRM." };
    }
    const listed = new Set(matches.flatMap((m) => m.subtitles.map((s) => s.url)));
    subtitleUrls = (req.subtitleUrls ?? []).filter((u) => listed.has(u) && isHttp(u));
  } else if (!ctx.knownUrls.has(req.url)) {
    return { ok: false, code: "NOT_DETECTED", error: "That link was not found on a page. Rescan and try again." };
  }

  let authority: { basis: string; attestedAt: number } | undefined;
  if (ctx.requireAuthority) {
    const basis = req.authority?.basis;
    if (!req.authority?.confirmed || !AUTHORITY_BASES.some((b) => b.id === basis)) {
      return { ok: false, code: "AUTHORITY_REQUIRED", error: "Confirm that you may save this file first." };
    }
    authority = { basis: basis as string, attestedAt: now };
  }

  const variantKind = source?.variants.find((v) => v.url === req.url)?.kind;
  const kind: VideoKind = variantKind ?? (source?.url === req.url ? source.kind : undefined) ?? classifyUrl(req.url) ?? "progressive";
  return { ok: true, filename: safeFilename(req.filename), subtitleUrls, kind, authority };
}
