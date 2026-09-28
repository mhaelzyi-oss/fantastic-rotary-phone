import { evaluateEligibility } from './sourceEligibility.js';
import { normalizeSource } from './sourceNormalizer.js';

export function createTrustedSubtitleSource(parent, requestedUrl) {
  if (parent?.protection?.isProtected)
    throw new Error('Protected media subtitles cannot be downloaded.');
  const subtitle = parent?.subtitles?.find((item) => (item.url || item.src) === requestedUrl);
  if (!subtitle) throw new Error('This caption is not listed for the trusted source.');
  let url;
  try {
    url = new URL(requestedUrl);
  } catch {
    throw new Error('Invalid caption URL.');
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Unsupported caption URL.');
  const source = normalizeSource(
    {
      src: url.href,
      label: `${parent.label} ${subtitle.label || subtitle.language || 'caption'}`,
      mime: subtitle.mime || 'text/vtt',
    },
    parent.pageUrl,
  );
  source.pageTitle = parent.pageTitle;
  source.pageUrl = parent.pageUrl;
  source.protection = parent.protection;
  source.eligibility = evaluateEligibility(source);
  if (source.streamType !== 'subtitle' || !source.eligibility.canDownloadDirectly)
    throw new Error('This caption is not an eligible subtitle sidecar.');
  return source;
}
