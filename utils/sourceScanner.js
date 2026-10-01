import { canonicalizeUrl, normalizeSource } from './sourceNormalizer.js';
import { detectPageProtection } from './protectionDetector.js';

const mediaAttributeNames = ['src', 'href', 'data-src', 'data-video-url', 'data-stream-url'];
const supportedPath = /\.(mp4|webm|m4v|mov|mp3|m4a|ogg|wav|m3u8|mpd|torrent|vtt)(?:$|[?#])/i;

export function mergeDiscoveredSource(existing, incoming) {
  if (!existing) return incoming;
  const signals = [
    ...new Set([...(existing.protection?.signals || []), ...(incoming.protection?.signals || [])]),
  ];
  const isProtected = Boolean(existing.protection?.isProtected || incoming.protection?.isProtected);
  const merged = { ...existing };
  for (const [key, value] of Object.entries(incoming)) {
    if (['protection', 'eligibility', 'variants', 'subtitles', 'id', 'discoveredAt'].includes(key))
      continue;
    if (
      (merged[key] == null || merged[key] === '' || merged[key] === 'unknown') &&
      value != null &&
      value !== ''
    )
      merged[key] = value;
  }
  merged.protection = {
    ...existing.protection,
    ...(incoming.protection || {}),
    isProtected,
    category: isProtected
      ? (incoming.protection?.isProtected && incoming.protection.category) ||
        existing.protection?.category ||
        'unknown_protected'
      : 'none',
    signals,
    reason: isProtected ? incoming.protection?.reason || existing.protection?.reason : null,
  };
  merged.subtitles = [
    ...new Map(
      [...(existing.subtitles || []), ...(incoming.subtitles || [])].map((item) => [
        item.url || item.src,
        item,
      ]),
    ).values(),
  ];
  merged.variants = existing.variants?.length ? existing.variants : incoming.variants || [];
  merged.eligibility = {};
  return merged;
}

export function scanDocument(doc = document, page = globalThis.location?.href || '') {
  const results = new Map();
  const add = (record) => {
    const source = normalizeSource(record, page);
    if (!source.src) return;
    source.protection = record.protection || source.protection;
    source.eligibility = {};
    const key = source.canonicalUrl || source.src;
    results.set(key, mergeDiscoveredSource(results.get(key), source));
  };
  for (const element of doc.querySelectorAll(
    'video, audio, source, track, a[href], [data-src], [data-video-url], [data-stream-url]',
  )) {
    const values = mediaAttributeNames.map((name) => element.getAttribute(name)).filter(Boolean);
    if (element.currentSrc) values.unshift(element.currentSrc);
    for (const raw of values) {
      if (
        !supportedPath.test(raw) &&
        !/^magnet:/i.test(raw) &&
        !element.matches('video, audio, source, track') &&
        !element.getAttribute('type')
      )
        continue;
      const tag = element.tagName.toLowerCase();
      const declaredType =
        element.getAttribute('type') ||
        (tag === 'video' || tag === 'audio'
          ? element.querySelector('source[type]')?.getAttribute('type')
          : null);
      const codecs = /codecs\s*=\s*["']?([^;"']+)/i.exec(declaredType || '')?.[1] || null;
      add({
        src: raw,
        mime: declaredType,
        codecs,
        bitrate: Number(element.getAttribute('data-bitrate')) || null,
        fps: Number(element.getAttribute('data-fps')) || null,
        estimatedSize:
          Number(
            element.getAttribute('data-estimated-size') || element.getAttribute('data-size'),
          ) || null,
        label:
          element.getAttribute('title') ||
          element.getAttribute('aria-label') ||
          element.getAttribute('alt'),
        width: element.videoWidth || null,
        height: element.videoHeight || null,
        durationSeconds: Number.isFinite(element.duration) ? element.duration : null,
        thumbnail: element.poster || null,
        protection: detectPageProtection(element),
      });
      if (tag === 'track' && element.src) {
        const source = normalizeSource(
          {
            src: element.src,
            streamType: 'subtitle',
            label: element.label || element.srclang || 'Subtitle',
          },
          page,
        );
        const parent = element.parentElement;
        const parentUrls = [
          parent?.currentSrc,
          ...[...(parent?.querySelectorAll('source[src]') || [])].map((node) => node.src),
        ].map((url) => canonicalizeUrl(url, page));
        const subtitle = {
          src: source.src,
          url: source.src,
          label: source.label,
          language: element.srclang || null,
          mime: element.getAttribute('type') || 'text/vtt',
        };
        for (const key of parentUrls) {
          const item = results.get(key);
          if (item)
            results.set(
              key,
              mergeDiscoveredSource(item, { ...item, subtitles: [...item.subtitles, subtitle] }),
            );
        }
      }
    }
  }
  for (const property of ['og:video', 'og:video:url', 'og:video:secure_url', 'og:audio']) {
    const value = doc.querySelector(`meta[property="${property}"]`)?.content;
    if (value) add({ src: value, label: doc.querySelector('meta[property="og:title"]')?.content });
  }
  for (const node of doc.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const json = JSON.parse(node.textContent || '');
      const records = Array.isArray(json) ? json : [json];
      for (const item of records) {
        const type = [].concat(item['@type'] || []);
        if (!type.some((name) => ['VideoObject', 'AudioObject'].includes(name))) continue;
        const url = item.contentUrl || item.embedUrl;
        if (url)
          add({
            src: url,
            label: item.name,
            thumbnail: Array.isArray(item.thumbnailUrl) ? item.thumbnailUrl[0] : item.thumbnailUrl,
            durationSeconds: null,
          });
      }
    } catch {}
  }
  return [...results.values()];
}
