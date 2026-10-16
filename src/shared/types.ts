/** Shared domain types for KUI Video Extractor. */

export type VideoKind = "progressive" | "hls" | "dash";

export type MediaSourceKind = "dom" | "meta" | "link" | "script" | "shadow" | "iframe" | "network";

export type Variant = {
  url: string;
  label: string;
  height?: number;
  width?: number;
  bandwidth?: number;
  codecs?: string;
  encrypted: boolean;
  kind: VideoKind;
};

/** @deprecated Use Variant */
export type QualityVariant = Variant;

export type SubtitleTrack = {
  url: string;
  label: string;
  language?: string;
};

export type MediaItem = {
  url: string;
  kind: VideoKind;
  originHost: string;
  title: string;
  pageUrl: string;
  source: MediaSourceKind;
  mime?: string;
  encrypted: boolean;
  variants: Variant[];
  subtitles: SubtitleTrack[];
  sizeEstimate?: number;
  durationSec?: number;
  codec?: string;
  resolution?: string;
  /** video or a standalone audio file. */
  medium?: "video" | "audio";
  /** visible on the page, hidden, off the screen, or seen only as a request. */
  placement?: "visible" | "hidden" | "offscreen" | "network";
  fileName?: string;
  byteLength?: number;
};

/** @deprecated Use MediaItem */
export type VideoSource = MediaItem;

export type ScanPayload = {
  pageUrl: string;
  pageTitle: string;
  sources: MediaItem[];
  error?: string;
  /** A video is playing through a blob/MediaSource stream the page does not expose as a URL. */
  blobPlayback?: boolean;
};

export type DownloadJob = {
  id: string;
  url: string;
  filename: string;
  title: string;
  quality: string;
  subtitleUrls?: string[];
  state: "queued" | "in_progress" | "complete" | "interrupted";
  chromeDownloadId?: number;
  percent: number;
  error?: string;
  createdAt: number;
  /** Chrome interrupt reason of the last failure, e.g. NETWORK_FAILED. */
  errorCode?: string;
  attempts?: number;
  nextRetryAt?: number;
  startedAt?: number;
  lastBytes?: number;
  lastAt?: number;
  bytesPerSecond?: number;
  authority?: { basis: string; attestedAt: number };
  /** "browser": chrome.downloads fetches the URL. "page": the page's content script joins HLS segments. */
  engine?: "browser" | "page";
  tabId?: number;
  /** Page engine: blob URL handed to the browser once the segments are joined. */
  blobUrl?: string;
};

export type ScanPrefs = {
  hidden: boolean;
  scripts: boolean;
  iframes: boolean;
};

export type CliTool = "yt-dlp" | "ffmpeg" | "streamlink" | "n-m3u8dl-re" | "curl" | "wget" | "aria2c";

export type CliShell = "bash" | "powershell" | "cmd";

export type UserPrefs = {
  /** Default CLI shown in the Command panel. */
  cliTool: CliTool;
  /** "auto" picks PowerShell on Windows and bash elsewhere. */
  cliShell: "auto" | CliShell;
  /** Add the page URL as Referer to generated commands. */
  cliReferer: boolean;
  /** Add this browser's User-Agent to generated commands. */
  cliUserAgent: boolean;
  /** yt-dlp only: pass the page URL so yt-dlp's own extractors resolve the media. */
  cliYtdlpPage: boolean;
  prompt: string;
  includeSubtitles: boolean;
  preferredQuality: "auto" | "2160" | "1080" | "720" | "480";
  maxHeight: "auto" | "2160" | "1080" | "720" | "480";
  activeBubbles: string[];
  saveAs: boolean;
  subfolder: string;
  conflict: "uniquify" | "overwrite";
  allowHosts: string[];
  blockHosts: string[];
  scan: ScanPrefs;
  showBadge: boolean;
  goldIcon: boolean;
  notifyDone: boolean;
  theme: "system" | "dark" | "light";
  /** Ask for a short rights declaration before each download. */
  requireAuthority: boolean;
  /** How the default quality is chosen when several variants exist. */
  qualityMode: "balanced" | "best" | "smallest";
};

export type HistoryItem = {
  id: string;
  title: string;
  filename: string;
  url: string;
  quality: string;
  at: number;
  ok: boolean;
  message?: string;
};

export type DownloadProgress = {
  /** Stable across retries and across the page-engine to browser hand-off. */
  jobId?: string;
  downloadId: number;
  filename?: string;
  percent: number;
  bytesReceived: number;
  totalBytes: number;
  etaSeconds: number | null;
  bytesPerSecond?: number;
  state: "in_progress" | "complete" | "interrupted";
  error?: string;
};

export type LibraryItem = {
  id: string;
  createdAt: number;
  updatedAt: number;
  title: string;
  url: string;
  pageUrl: string;
  originHost: string;
  kind: VideoKind;
  tags: string[];
  note: string;
};

export type Diagnostic = {
  id: string;
  at: number;
  severity: "info" | "warn" | "error";
  code: string;
  message: string;
  host?: string;
};

export const DEFAULT_PROMPT = "{title}_{YYYYMMDD}_{quality}.mp4";

export const DEFAULT_PREFS: UserPrefs = {
  cliTool: "yt-dlp",
  cliShell: "auto",
  cliReferer: true,
  cliYtdlpPage: false,
  cliUserAgent: false,
  prompt: DEFAULT_PROMPT,
  includeSubtitles: false,
  preferredQuality: "auto",
  maxHeight: "auto",
  activeBubbles: ["auto"],
  saveAs: false,
  subfolder: "KUIVideoExtractor",
  conflict: "uniquify",
  allowHosts: [],
  blockHosts: [],
  scan: { hidden: true, scripts: true, iframes: true },
  showBadge: true,
  goldIcon: true,
  notifyDone: false,
  theme: "system",
  requireAuthority: false,
  qualityMode: "balanced",
};

export const DRM_HOST_HINTS = [
  "netflix.com",
  "disneyplus.com",
  "hulu.com",
  "max.com",
  "hbomax.com",
  "primevideo.com",
  "tv.apple.com",
  "peacocktv.com",
  "paramountplus.com",
  "crunchyroll.com",
];
