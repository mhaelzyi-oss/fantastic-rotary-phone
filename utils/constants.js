export const SCHEMA_VERSION = 1;
export const POLICY_VERSION = '1.0';
export const DEFAULT_PROMPT =
  'Save highest-quality non-DRM stream as MP4; prefer 1080p>720p>480p; include subtitles if available; filename "{title}_{YYYYMMDD}_{quality}.mp4"; auto-save to Downloads; show gold progress bar and ETA.';
export const DEFAULT_SETTINGS = {
  theme: 'dark',
  liquidGlassIntensity: 'standard',
  reduceMotionOverride: 'system',
  telemetryOptIn: false,
  defaultQualityMode: 'best_balance',
  defaultPrompt: DEFAULT_PROMPT,
  filenameTemplate: '{title}_{YYYYMMDD}_{quality}.{ext}',
  defaultDownloadSubtitles: false,
  rememberAuthorityBasis: false,
  authorityPolicyVersion: POLICY_VERSION,
  maxHistoryItems: 100,
  maxLibraryItems: 500,
  maxErrorSnapshots: 30,
  hostPermissionMode: 'ask',
  lastUpdatedAt: Date.now(),
};
export const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'm4v', 'mov']);
export const AUDIO_EXTENSIONS = new Set(['mp3', 'm4a', 'ogg', 'wav']);
export const MANIFEST_EXTENSIONS = new Set(['m3u8', 'mpd']);
export const TORRENT_EXTENSIONS = new Set(['torrent']);
export const SUBTITLE_EXTENSIONS = new Set(['vtt', 'srt', 'ass', 'ssa']);
export const ELIGIBILITY_CODES = Object.freeze({
  NONE: 'NONE',
  PROTECTED_MEDIA: 'PROTECTED_MEDIA',
  TORRENT_UNSUPPORTED: 'TORRENT_UNSUPPORTED',
  MISSING_URL: 'MISSING_URL',
  UNSUPPORTED_TYPE: 'UNSUPPORTED_TYPE',
  CORS_ORIGIN_LIMITATION: 'CORS_ORIGIN_LIMITATION',
  AUTH_REQUIRED: 'AUTH_REQUIRED',
  LIVE_STREAM_UNSUPPORTED: 'LIVE_STREAM_UNSUPPORTED',
  UNKNOWN: 'UNKNOWN',
});
