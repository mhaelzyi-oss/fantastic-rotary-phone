import type { MediaItem, MediaSourceKind, SubtitleTrack } from "../shared/types";
import { classifyUrl, extractMediaUrlsFromText, hostLooksDrm, isSegmentUrl, looksLikeVideo, mediaMedium, originHost, stripTracking } from "../shared/url";
import { networkHits } from "./network";

export type Placement = "visible" | "hidden" | "offscreen" | "network";

type Hit = {
  url: string;
  source: MediaSourceKind;
  mime?: string;
  encrypted?: boolean;
  medium?: "video" | "audio";
  placement?: Placement;
  durationSec?: number;
  resolution?: string;
  byteLength?: number;
  fileName?: string;
};

function styleHides(style: CSSStyleDeclaration): boolean {
  return style.display === "none" || style.visibility === "hidden" || Number.parseFloat(style.opacity) === 0;
}

/** `instanceof HTMLElement` is false for nodes inside an iframe (a different window). */
function inRealm(node: object, className: "HTMLElement"): node is HTMLElement;
function inRealm(node: object, className: "HTMLVideoElement"): node is HTMLVideoElement;
function inRealm(node: object, className: "ShadowRoot"): node is ShadowRoot;
function inRealm(node: object, className: "HTMLElement" | "HTMLVideoElement" | "ShadowRoot"): boolean {
  const doc = "ownerDocument" in node ? (node as Node).ownerDocument : null;
  const ctor = doc?.defaultView?.[className];
  return Boolean(ctor && node instanceof ctor);
}

function visualParent(node: HTMLElement): HTMLElement | null {
  if (node.parentElement) return node.parentElement;
  const root = node.getRootNode();
  if (!inRealm(root, "ShadowRoot")) return null;
  const host = (root as ShadowRoot).host;
  return inRealm(host, "HTMLElement") ? (host as HTMLElement) : null;
}

/** Hidden by its own box, or by a parent (including a shadow host) that is not shown. */
function isVisuallyHidden(el: HTMLElement): boolean {
  let node: HTMLElement | null = el;
  while (node) {
    if (node.hidden || (node === el && node.getAttribute("aria-hidden") === "true")) return true;
    const view = node.ownerDocument?.defaultView;
    if (view) {
      try {
        if (styleHides(view.getComputedStyle(node))) return true;
      } catch {
        /* element belongs to another document */
      }
    }
    node = visualParent(node);
  }
  return false;
}

/** Where a media element sits: on screen, hidden, or outside the window. */
export function readPlacement(el: Element): Exclude<Placement, "network"> {
  if (!inRealm(el, "HTMLElement")) return "hidden";
  if (isVisuallyHidden(el)) return "hidden";
  const box = el.getBoundingClientRect();
  if (box.width < 2 || box.height < 2) return "hidden";
  const view = el.ownerDocument?.defaultView;
  const root = el.ownerDocument?.documentElement;
  const vw = view?.innerWidth || root?.clientWidth || 0;
  const vh = view?.innerHeight || root?.clientHeight || 0;
  if (vw > 0 && vh > 0 && (box.bottom <= 0 || box.right <= 0 || box.top >= vh || box.left >= vw)) return "offscreen";
  return "visible";
}

function combinePlacement(
  outer: Exclude<Placement, "network">,
  inner: Exclude<Placement, "network">,
): Exclude<Placement, "network"> {
  if (outer === "hidden" || inner === "hidden") return "hidden";
  if (outer === "offscreen" || inner === "offscreen") return "offscreen";
  return "visible";
}

const PLACEMENT_RANK: Record<Placement, number> = { network: 0, hidden: 1, offscreen: 2, visible: 3 };

function preferPlacement(current: Placement | undefined, next: Placement | undefined): Placement | undefined {
  if (!next) return current;
  if (!current || PLACEMENT_RANK[next] > PLACEMENT_RANK[current]) return next;
  return current;
}

function hitMedium(tag: "audio" | "video", url: string | null, mime = ""): "video" | "audio" {
  const type = mime.toLowerCase();
  const bare = url ? url.split("#")[0] : "";
  const manifest = type.includes("mpegurl") || type.includes("dash+xml") || /\.(m3u8|mpd)(\?|$)/i.test(bare);
  if (manifest) return "video";
  if (tag === "audio" || (url != null && mediaMedium(url, mime) === "audio")) return "audio";
  return "video";
}

function abs(href: string | null | undefined, base = document.baseURI): string | null {
  if (!href) return null;
  try {
    const url = new URL(href, base).href;
    return /^https?:/i.test(url) ? url : null;
  } catch {
    return null;
  }
}

function pushUrl(
  urls: Map<string, Hit>,
  url: string | null,
  source: MediaSourceKind,
  mime?: string,
  encrypted?: boolean,
  extra: Partial<Hit> = {},
): void {
  if (!url || !looksLikeVideo(url, mime) || isSegmentUrl(url)) return;
  const key = stripTracking(url);
  const prev = urls.get(key);
  if (!prev) {
    urls.set(key, { url: key, source, mime, encrypted, ...extra, medium: extra.medium ?? mediaMedium(key, mime) });
    return;
  }
  if (encrypted) prev.encrypted = true;
  if (mime && !prev.mime) prev.mime = mime;
  if (extra.byteLength && !prev.byteLength) prev.byteLength = extra.byteLength;
  if (extra.fileName && !prev.fileName) prev.fileName = extra.fileName;
  if (extra.durationSec && !prev.durationSec) prev.durationSec = extra.durationSec;
  if (extra.resolution && !prev.resolution) prev.resolution = extra.resolution;
  if (extra.medium === "audio") prev.medium = "audio";
  if (extra.placement) prev.placement = preferPlacement(prev.placement, extra.placement);
}

function collectJsonLd(data: unknown, urls: Map<string, Hit>): void {
  if (!data) return;
  if (Array.isArray(data)) {
    data.forEach((item) => collectJsonLd(item, urls));
    return;
  }
  if (typeof data !== "object") return;
  const obj = data as Record<string, unknown>;
  const types = obj["@type"];
  const isVideo = types === "VideoObject" || (Array.isArray(types) && types.includes("VideoObject"));
  if (isVideo && typeof obj.contentUrl === "string") pushUrl(urls, abs(obj.contentUrl), "meta");
  if (obj["@graph"]) collectJsonLd(obj["@graph"], urls);
}

function scanMediaInRoot(
  root: ParentNode,
  urls: Map<string, Hit>,
  source: MediaSourceKind,
  base: string | undefined,
  includeHidden: boolean,
  framePlace?: Exclude<Placement, "network">,
): void {
  const q = (sel: string) => root.querySelectorAll(sel);
  const placementOf = (el: Element) => {
    const own = readPlacement(el);
    return framePlace ? combinePlacement(framePlace, own) : own;
  };
  for (const el of q("video, audio")) {
    const placement = placementOf(el);
    if (!includeHidden && placement === "hidden") continue;
    const media = el as HTMLMediaElement;
    const tag = el.tagName === "AUDIO" ? "audio" : "video";
    const locked = Boolean(media.mediaKeys);
    const durationSec = Number.isFinite(media.duration) && media.duration > 0 && media.duration < 1e7 ? media.duration : undefined;
    const video = inRealm(el, "HTMLVideoElement") ? (el as HTMLVideoElement) : null;
    const resolution = video && video.videoWidth > 0 && video.videoHeight > 0 ? `${video.videoWidth}×${video.videoHeight}` : undefined;
    const pushMedia = (href: string | null, mime?: string) => {
      const url = abs(href, base);
      pushUrl(urls, url, source, mime, locked, {
        medium: hitMedium(tag, url, mime),
        placement,
        durationSec,
        resolution,
      });
    };
    pushMedia(media.currentSrc || media.getAttribute("src"));
    for (const s of el.querySelectorAll("source")) pushMedia(s.getAttribute("src"), s.getAttribute("type") || undefined);
  }
  for (const s of q("source[src], track[src]")) {
    const parent = s.closest("video, audio");
    if (parent && (s.tagName === "SOURCE" || (!includeHidden && placementOf(parent) === "hidden"))) continue;
    pushUrl(urls, abs(s.getAttribute("src"), base), source, (s as HTMLSourceElement).type || undefined);
  }
  if (!includeHidden) return;
  for (const el of q("[data-src], [data-video], [data-video-src], [data-stream], [data-hls], [data-mpd]")) {
    for (const attr of ["data-src", "data-video", "data-video-src", "data-stream", "data-hls", "data-mpd", "src"]) {
      pushUrl(urls, abs(el.getAttribute(attr), base), source);
    }
  }
}

function walkShadows(
  root: ParentNode,
  urls: Map<string, Hit>,
  source: MediaSourceKind,
  includeHidden: boolean,
  framePlace?: Exclude<Placement, "network">,
  depth = 0,
): void {
  if (depth > 6) return;
  scanMediaInRoot(root, urls, source, undefined, includeHidden, framePlace);
  for (const el of root.querySelectorAll("*")) {
    if (el.shadowRoot) walkShadows(el.shadowRoot, urls, "shadow", includeHidden, framePlace, depth + 1);
  }
}

export type CollectOptions = {
  hidden?: boolean;
  scripts?: boolean;
  iframes?: boolean;
};

/** Collect candidate media URLs, including hidden nodes, shadow roots, iframes, and script strings. */
export function collectCandidateUrls(opts: CollectOptions = {}): Hit[] {
  const hidden = opts.hidden !== false;
  const scripts = opts.scripts !== false;
  const iframes = opts.iframes !== false;
  const urls = new Map<string, Hit>();
  walkShadows(document, urls, "dom", hidden);

  for (const hit of networkHits()) {
    pushUrl(urls, hit.url, "network", hit.mime, undefined, {
      placement: "network",
      byteLength: hit.bytes,
      fileName: hit.fileName,
      medium: mediaMedium(hit.url, hit.mime),
    });
  }

  for (const sel of [
    'meta[property="og:video"]',
    'meta[property="og:video:url"]',
    'meta[property="og:video:secure_url"]',
    'meta[name="twitter:player:stream"]',
  ]) {
    pushUrl(urls, abs(document.querySelector(sel)?.getAttribute("content")), "meta");
  }

  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      collectJsonLd(JSON.parse(script.textContent || "null"), urls);
    } catch {
      /* ignore */
    }
  }

  if (scripts) {
    for (const script of document.scripts) {
      const text = script.textContent;
      if (!text || text.length > 500_000) continue;
      for (const url of extractMediaUrlsFromText(text)) pushUrl(urls, url, "script");
    }
  }

  for (const a of document.querySelectorAll<HTMLAnchorElement>("a[href]")) {
    pushUrl(urls, abs(a.href), "link");
  }

  if (iframes) {
    for (const frame of document.querySelectorAll("iframe")) {
      try {
        const doc = frame.contentDocument;
        if (!doc) continue;
        const framePlace = readPlacement(frame);
        if (!hidden && framePlace === "hidden") continue;
        walkShadows(doc, urls, "iframe", hidden, framePlace);
        const html = doc.documentElement?.innerHTML;
        if (html && html.length < 500_000) {
          for (const url of extractMediaUrlsFromText(html)) pushUrl(urls, url, "iframe");
        }
      } catch {
        /* cross-origin frame — skipped */
      }
    }
  }

  return [...urls.values()];
}

/**
 * A player that feeds the video element from a MediaSource (blob: URL) has no file URL to give. YouTube
 * and many other sites work this way. The page address is the only handle (see the yt-dlp page mode).
 */
export function hasBlobPlayback(): boolean {
  for (const el of document.querySelectorAll("video, audio")) {
    const media = el as HTMLMediaElement;
    if ((media.currentSrc || media.getAttribute("src") || "").startsWith("blob:")) return true;
  }
  return false;
}

export function collectDomSubtitles(): SubtitleTrack[] {
  const tracks: SubtitleTrack[] = [];
  const seen = new Set<string>();
  for (const track of document.querySelectorAll("track[src]")) {
    const url = abs(track.getAttribute("src"));
    if (!url || seen.has(url)) continue;
    seen.add(url);
    tracks.push({
      url,
      label: track.getAttribute("label") || track.getAttribute("srclang") || "Subtitles",
      language: track.getAttribute("srclang") || undefined,
    });
  }
  return tracks;
}

export function pageVideoMeta(): { codec?: string; resolution?: string; durationSec?: number } {
  const videos = [...document.querySelectorAll("video")];
  const video = videos.find((v) => v.videoWidth > 0) ?? videos[0];
  if (!video) return {};
  const w = video.videoWidth;
  const h = video.videoHeight;
  return {
    resolution: w && h ? `${w}×${h}` : undefined,
    durationSec: Number.isFinite(video.duration) && video.duration > 0 ? video.duration : undefined,
  };
}

export function toStubSource(
  item: Hit,
  pageTitle: string,
  pageUrl: string,
): MediaItem | null {
  const kind = classifyUrl(item.url, item.mime);
  if (!kind) return null;
  const encrypted = Boolean(item.encrypted) || hostLooksDrm(pageUrl);
  const medium = item.medium ?? mediaMedium(item.url, item.mime);
  const meta = medium === "audio" ? {} : pageVideoMeta();
  return {
    url: item.url,
    kind,
    originHost: originHost(item.url) || originHost(pageUrl),
    title: pageTitle || "video",
    pageUrl,
    source: item.source,
    mime: item.mime,
    encrypted,
    medium,
    placement: item.placement,
    fileName: item.fileName,
    byteLength: item.byteLength,
    sizeEstimate: item.byteLength,
    variants:
      kind === "progressive"
        ? [
            {
              url: item.url,
              label: medium === "audio" ? "Audio" : meta.resolution?.split("×")[1] ? `${meta.resolution.split("×")[1]}p` : "Source",
              encrypted,
              kind,
              codecs: meta.codec,
            },
          ]
        : [],
    subtitles: collectDomSubtitles(),
    durationSec: item.durationSec ?? meta.durationSec,
    resolution: item.resolution ?? meta.resolution,
    codec: meta.codec,
  };
}
