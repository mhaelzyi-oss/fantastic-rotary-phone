import { ELIGIBILITY_CODES } from './constants.js';

export function evaluateEligibility(source) {
  const base = {
    canPreview: false,
    canDownloadDirectly: false,
    canSaveManifest: false,
    canSaveSubtitles: false,
    canCopySource: Boolean(source?.src),
    canOpenSource: Boolean(source?.src),
    canSaveToLibrary: Boolean(source?.src),
    blockReason: null,
    blockCode: ELIGIBILITY_CODES.NONE,
  };
  const block = (reason, code) => ({ ...base, blockReason: reason, blockCode: code });
  if (!source?.src) return block('No source URL is available.', ELIGIBILITY_CODES.MISSING_URL);
  if (source.protection?.isProtected)
    return block(
      'Protected or encrypted media cannot be downloaded.',
      ELIGIBILITY_CODES.PROTECTED_MEDIA,
    );
  if (
    source.streamType === 'torrent' ||
    /^magnet:/i.test(source.src) ||
    /\.torrent(?:$|[?#])/i.test(source.src)
  )
    return block(
      'Torrent and magnet sources are not supported.',
      ELIGIBILITY_CODES.TORRENT_UNSUPPORTED,
    );
  if (source.streamType === 'direct' || source.streamType === 'audio')
    return { ...base, canPreview: true, canDownloadDirectly: true, canSaveSubtitles: true };
  if (source.streamType === 'subtitle')
    return { ...base, canDownloadDirectly: true, canSaveSubtitles: true };
  if (source.streamType === 'hls' || source.streamType === 'dash')
    return {
      ...base,
      canPreview: false,
      canSaveManifest: true,
      blockReason:
        'Analyze the accessible manifest first; live and protected streams remain unavailable.',
      blockCode: ELIGIBILITY_CODES.LIVE_STREAM_UNSUPPORTED,
    };
  return block(
    'The source type could not be verified as supported media.',
    ELIGIBILITY_CODES.UNSUPPORTED_TYPE,
  );
}
