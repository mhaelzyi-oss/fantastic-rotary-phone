import { normalizeSource } from './sourceNormalizer.js';
import { detectPageProtection } from './protectionDetector.js';

const mediaAttributeNames = ['src', 'href', 'data-src', 'data-video-url', 'data-stream-url'];
const supportedPath = /\.(mp4|webm|m4v|mov|mp3|m4a|ogg|wav|m3u8|mpd|torrent|vtt)(?:$|[?#])/i;

export function scanDocument(doc = document, page = globalThis.location?.href || '') {
  const results = new Map();
  const add = (record) => {
    const source = normalizeSource(record, page);
    if (!source.src) return;
    source.protection = record.protection || source.protection;
    source.eligibility = {};
    const key = source.canonicalUrl || source.src;
    const existing = results.get(key);
    if (!existing || (existing.streamType === 'unknown' && source.streamType !== 'unknown'))
      results.set(key, source);
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
      add({
        src: raw,
        mime: element.getAttribute('type'),
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
        for (const item of results.values())
          if (item.src === element.parentElement?.currentSrc)
            item.subtitles.push({
              src: source.src,
              label: source.label,
              language: element.srclang || null,
            });
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
