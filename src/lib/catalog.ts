export const tools = [
  { slug: "detect", name: "Detect", kicker: "Page scan", summary: "Find media the page already exposed." },
  { slug: "analyze", name: "Analyze", kicker: "HLS and DASH", summary: "Read playlists. Locked and live stay blocked." },
  { slug: "quality", name: "Quality", kicker: "Variants", summary: "Pick height and bitrate from listed variants." },
  { slug: "library", name: "Library", kicker: "Saved", summary: "Keep source references on this device." },
  { slug: "names", name: "Names", kicker: "Filenames", summary: "Fill {title}_{host}_{YYYYMMDD}_{quality}.{ext}." },
  { slug: "extractor", name: "Extractor", kicker: "Extension", summary: "Save the public file from the page." },
] as const;
