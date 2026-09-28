import {
  AUDIO_EXTENSIONS,
  MANIFEST_EXTENSIONS,
  SUBTITLE_EXTENSIONS,
  TORRENT_EXTENSIONS,
  VIDEO_EXTENSIONS,
} from './constants.js';

export function resolveSourceUrl(raw, baseUrl) {
  if (!raw || typeof raw !== 'string') return null;
  try {
    return new URL(raw.trim(), baseUrl || undefined).href;
  } catch {
    return null;
  }
}

export function canonicalizeUrl(raw, baseUrl) {
  const resolved = resolveSourceUrl(raw, baseUrl);
  if (!resolved) return null;
  try {
    const url = new URL(resolved);
    url.hash = '';
    return url.href;
  } catch {
    return null;
  }
}

function extensionOf(url) {
  try {
    return new URL(url).pathname.split('.').pop().toLowerCase();
  } catch {
    return '';
  }
}

function decodedPathname(url) {
  try {
    return decodeURIComponent(new URL(url).pathname.split('/').pop() || '');
  } catch {
    try {
      return new URL(url).pathname.split('/').pop() || '';
    } catch {
      return '';
    }
  }
}

export function normalizeSource(input = {}, pageUrl = null) {
  const src = resolveSourceUrl(input.src ?? input.url, pageUrl);
  const canonicalUrl = canonicalizeUrl(src, pageUrl);
  const mime = (input.mime ?? input.type ?? '').split(';')[0].trim().toLowerCase() || null;
  const extension = extensionOf(src ?? '');
  let streamType = 'unknown';
  if (TORRENT_EXTENSIONS.has(extension) || /^magnet:/i.test(input.src ?? ''))
    streamType = 'torrent';
  else if (SUBTITLE_EXTENSIONS.has(extension) || /^text\/(?:vtt|srt)/.test(mime ?? ''))
    streamType = 'subtitle';
  else if (MANIFEST_EXTENSIONS.has(extension) || /mpegurl|dash\+xml/.test(mime ?? ''))
    streamType = extension === 'mpd' || mime?.includes('dash') ? 'dash' : 'hls';
  else if (AUDIO_EXTENSIONS.has(extension) || mime?.startsWith('audio/')) streamType = 'audio';
  else if (VIDEO_EXTENSIONS.has(extension) || mime?.startsWith('video/')) streamType = 'direct';
  const width =
    Number.isFinite(Number(input.width)) && Number(input.width) > 0 ? Number(input.width) : null;
  const height =
    Number.isFinite(Number(input.height)) && Number(input.height) > 0 ? Number(input.height) : null;
  let originHost = null;
  try {
    originHost = new URL(src).host;
  } catch {}
  const title = input.label || input.title || (src ? decodedPathname(src) : 'Media source');
  return {
    id: input.id || canonicalUrl || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    src,
    canonicalUrl,
    label: title || 'Media source',
    pageTitle: input.pageTitle || null,
    pageUrl: pageUrl || input.pageUrl || null,
    thumbnail: input.thumbnail || null,
    resolution: input.resolution || (height ? `${height}p` : null),
    width,
    height,
    bitrate: Number(input.bitrate) || null,
    durationSeconds: Number(input.durationSeconds) || null,
    fps: Number(input.fps) || null,
    mime,
    codecs: input.codecs || null,
    streamType,
    originHost,
    estimatedSize: Number(input.estimatedSize) || null,
    discoveredAt: input.discoveredAt || Date.now(),
    subtitles: Array.isArray(input.subtitles) ? input.subtitles : [],
    variants: Array.isArray(input.variants) ? input.variants : [],
    protection: input.protection || {
      isProtected: false,
      category: 'none',
      signals: [],
      reason: null,
      detectedAt: Date.now(),
    },
    eligibility: input.eligibility || {},
  };
}

export function sourceExtension(source) {
  return extensionOf(source?.src ?? '');
}

export function sourceDownloadExtension(source) {
  const extension = sourceExtension(source);
  if (VIDEO_EXTENSIONS.has(extension) || AUDIO_EXTENSIONS.has(extension)) return extension;
  if (SUBTITLE_EXTENSIONS.has(extension)) return extension;
  const mime = (source?.mime || '').split(';')[0].trim().toLowerCase();
  const mimeExtensions = {
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'video/quicktime': 'mov',
    'video/x-m4v': 'm4v',
    'audio/mpeg': 'mp3',
    'audio/mp4': 'm4a',
    'audio/ogg': 'ogg',
    'audio/wav': 'wav',
    'audio/x-wav': 'wav',
    'text/vtt': 'vtt',
    'application/x-subrip': 'srt',
  };
  return mimeExtensions[mime] || (source?.streamType === 'audio' ? 'mp3' : 'mp4');
}
