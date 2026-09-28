import { detectDashProtection, detectHlsProtection } from './protectionDetector.js';

export function resolveUrl(relativeOrAbsoluteUrl, baseUrl) {
  try {
    return new URL(relativeOrAbsoluteUrl, baseUrl).href;
  } catch {
    return null;
  }
}

export function isLiveHlsPlaylist(text) {
  return !/^#EXT-X-ENDLIST\s*$/m.test(text);
}

export function sortVariants(variants) {
  return [...variants].sort(
    (a, b) => (b.height ?? 0) - (a.height ?? 0) || (b.bandwidth ?? 0) - (a.bandwidth ?? 0),
  );
}

export function formatVariantLabel(variant) {
  return `${variant.height ? `${variant.height}p` : 'Unknown'}${variant.bandwidth ? ` · ${Math.round(variant.bandwidth / 1000)} kbps` : ''}`;
}

export function parseHlsMasterPlaylist(text, manifestUrl) {
  const lines = text.split(/\r?\n/).map((line) => line.trim());
  const variants = [];
  const subtitles = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.startsWith('#EXT-X-MEDIA:')) {
      const attrs = Object.fromEntries(
        [...line.slice(line.indexOf(':') + 1).matchAll(/([\w-]+)=(?:"([^"]*)"|([^,]*))/g)].map(
          (match) => [match[1].toUpperCase(), match[2] ?? match[3]],
        ),
      );
      if (attrs.TYPE === 'SUBTITLES' && attrs.URI)
        subtitles.push({
          language: attrs.LANGUAGE || null,
          label: attrs.NAME || attrs.LANGUAGE || 'Subtitle',
          url: resolveUrl(attrs.URI, manifestUrl),
        });
    }
    if (!line.startsWith('#EXT-X-STREAM-INF:')) continue;
    const attrs = Object.fromEntries(
      [...line.slice(line.indexOf(':') + 1).matchAll(/([\w-]+)=(?:"([^"]*)"|([^,]*))/g)].map(
        (match) => [match[1].toUpperCase(), match[2] ?? match[3]],
      ),
    );
    const uri = lines.slice(index + 1).find((next) => next && !next.startsWith('#'));
    if (!uri) continue;
    const dimensions = /^(\d+)x(\d+)$/i.exec(attrs.RESOLUTION || '');
    variants.push({
      url: resolveUrl(uri, manifestUrl),
      bandwidth: Number(attrs.BANDWIDTH) || null,
      averageBandwidth: Number(attrs['AVERAGE-BANDWIDTH']) || null,
      width: dimensions ? Number(dimensions[1]) : null,
      height: dimensions ? Number(dimensions[2]) : null,
      codecs: attrs.CODECS || null,
      frameRate: Number(attrs['FRAME-RATE']) || null,
      audioGroup: attrs.AUDIO || null,
      subtitleGroup: attrs.SUBTITLES || null,
      videoRange: attrs['VIDEO-RANGE'] || null,
    });
  }
  return {
    variants: sortVariants(variants),
    subtitles,
    protection: detectHlsProtection(text),
    live: false,
    kind: 'master',
  };
}

export function parseHlsMediaPlaylist(text, manifestUrl) {
  const segments = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => resolveUrl(line, manifestUrl));
  const live = isLiveHlsPlaylist(text);
  return {
    variants: [],
    subtitles: [],
    segments,
    live,
    vodLike: !live,
    protection: detectHlsProtection(text),
    kind: 'media',
  };
}

export function parseHlsManifest(text, manifestUrl) {
  const master = parseHlsMasterPlaylist(text, manifestUrl);
  return master.variants.length || master.subtitles.length
    ? master
    : parseHlsMediaPlaylist(text, manifestUrl);
}

export function parseDashManifest(text, mpdUrl) {
  const parser = new DOMParser();
  const document = parser.parseFromString(text, 'application/xml');
  const parseError = document.querySelector('parsererror');
  if (parseError)
    return {
      variants: [],
      protection: detectDashProtection(text),
      diagnostics: ['Invalid DASH XML'],
      parseError: true,
    };
  const variants = [];
  for (const adaptation of document.getElementsByTagName('AdaptationSet')) {
    const adaptationMime = adaptation.getAttribute('mimeType');
    const adaptationCodecs = adaptation.getAttribute('codecs');
    const adaptationBase = adaptation.getElementsByTagName('BaseURL')[0]?.textContent?.trim() || '';
    for (const representation of adaptation.getElementsByTagName('Representation')) {
      if (representation.parentElement !== adaptation) continue;
      const base =
        representation.getElementsByTagName('BaseURL')[0]?.textContent?.trim() || adaptationBase;
      const template =
        representation.getElementsByTagName('SegmentTemplate')[0] ||
        adaptation.getElementsByTagName('SegmentTemplate')[0];
      const list =
        representation.getElementsByTagName('SegmentList')[0] ||
        adaptation.getElementsByTagName('SegmentList')[0];
      variants.push({
        id: representation.getAttribute('id'),
        mimeType: representation.getAttribute('mimeType') || adaptationMime,
        codecs: representation.getAttribute('codecs') || adaptationCodecs,
        width: Number(representation.getAttribute('width')) || null,
        height: Number(representation.getAttribute('height')) || null,
        frameRate: representation.getAttribute('frameRate'),
        bandwidth: Number(representation.getAttribute('bandwidth')) || null,
        url: base ? resolveUrl(base, mpdUrl) : mpdUrl,
        segmentTemplate: template
          ? Object.fromEntries([...template.attributes].map((attr) => [attr.name, attr.value]))
          : null,
        segmentList: list ? true : false,
        mediaType: (adaptationMime || '').startsWith('audio/') ? 'audio' : 'video',
      });
    }
  }
  const protection = detectDashProtection(text);
  return {
    variants: sortVariants(variants),
    protection,
    diagnostics: [],
    parseError: false,
    protected: protection.isProtected,
  };
}
