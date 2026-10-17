export type WebTool = {
  slug: string;
  name: string;
  short: string;
  kicker: string;
  summary: string;
};

/** Same lineup as site/lib/web-tools.mjs — keep the two lists in lockstep. */
export const webTools: WebTool[] = [
  {
    slug: "convert",
    name: "Video Converter",
    short: "Converter",
    kicker: "Free tool",
    summary: "Wrap a local video as a clean MP4. Same codec. No upload.",
  },
  {
    slug: "compress",
    name: "Video Compressor",
    short: "Compressor",
    kicker: "Free tool",
    summary: "Re-encode a local video to a smaller file in this browser.",
  },
  {
    slug: "trim",
    name: "Video Trimmer",
    short: "Trimmer",
    kicker: "Free tool",
    summary: "Keep a time range from a local video.",
  },
  {
    slug: "merge",
    name: "Video Merger",
    short: "Merger",
    kicker: "Free tool",
    summary: "Join local clips with matching codecs into one file.",
  },
  {
    slug: "gif",
    name: "Video to GIF",
    short: "GIF",
    kicker: "Free tool",
    summary: "Turn a local clip into a GIF.",
  },
  {
    slug: "audio",
    name: "Audio Extractor",
    short: "Audio",
    kicker: "Free tool",
    summary: "Pull the audio track from a local video.",
  },
  {
    slug: "add-audio",
    name: "Add Music",
    short: "Music",
    kicker: "Free tool",
    summary: "Add a local audio file onto a local video.",
  },
];

export function toolPagePath(slug: string): string {
  return `tools/${slug}/index.html`;
}

export function toolPageUrl(slug: string): string {
  if (typeof chrome !== "undefined" && chrome.runtime?.getURL) return chrome.runtime.getURL(toolPagePath(slug));
  return `/${toolPagePath(slug)}`;
}

export function openToolPage(slug: string): void {
  const url = toolPageUrl(slug);
  const fallback = () => {
    window.open(url, "_blank", "noopener");
  };
  try {
    if (typeof chrome !== "undefined" && chrome.tabs?.create) {
      const opened = chrome.tabs.create({ url });
      if (opened && typeof opened.catch === "function") void opened.catch(fallback);
      return;
    }
  } catch {
    /* popup or Firefox can refuse tabs.create */
  }
  fallback();
}
