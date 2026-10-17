/** Product lineup for the site, ads, and README. Extractor is the extension; the rest are local-file web tools. */

export const extractor = {
  slug: "extractor",
  name: "Extractor",
  kicker: "Browser extension",
  summary: "Find the public file on this page and save it.",
  kind: "extension",
};

export const webTools = [
  {
    slug: "convert",
    name: "Video Converter",
    short: "Converter",
    kicker: "Remux",
    summary: "Wrap a local video as a clean MP4. Same codec. No upload.",
  },
  {
    slug: "compress",
    name: "Video Compressor",
    short: "Compressor",
    kicker: "Smaller file",
    summary: "Re-encode a local video to a smaller file in this browser.",
  },
  {
    slug: "trim",
    name: "Video Trimmer",
    short: "Trimmer",
    kicker: "Cut",
    summary: "Keep a time range from a local video.",
  },
  {
    slug: "merge",
    name: "Video Merger",
    short: "Merger",
    kicker: "Join",
    summary: "Join local clips with matching codecs into one file.",
  },
  {
    slug: "gif",
    name: "Video to GIF",
    short: "GIF",
    kicker: "Animated",
    summary: "Turn a local clip into a GIF.",
  },
  {
    slug: "audio",
    name: "Audio Extractor",
    short: "Audio",
    kicker: "Soundtrack",
    summary: "Pull the audio track from a local video.",
  },
  {
    slug: "add-audio",
    name: "Add Music",
    short: "Music",
    kicker: "Mux",
    summary: "Add a local audio file onto a local video.",
  },
];

export const FORBIDDEN_PRODUCT_NAMES = ["Detect", "Analyze", "Quality", "Library", "Names", "Subs", "HLS player", "Cast"];

export function zipName(slug, version) {
  return `kui-tool-${slug}-${version}.zip`;
}

function esc(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function extractorCard() {
  return `<article class="tool glass featured" id="tool-${extractor.slug}">
            <p class="tool-kicker">${esc(extractor.kicker)}</p>
            <h3>${esc(extractor.name)}</h3>
            <p class="muted">${esc(extractor.summary)}</p>
            <p class="tool-actions"><a class="btn btn-blue small" href="#install">Install extension</a></p>
          </article>`;
}

function webToolCard(tool, version, base = "") {
  const zip = zipName(tool.slug, version);
  return `<article class="tool glass" id="tool-${tool.slug}">
            <p class="tool-kicker">${esc(tool.kicker)}</p>
            <h3>${esc(tool.name)}</h3>
            <p class="muted">${esc(tool.summary)}</p>
            <p class="tool-actions">
              <a class="btn btn-blue small" href="${base}/tools/${tool.slug}/">Open</a>
              <a class="btn btn-ghost small" href="${base}/downloads/${zip}" download data-kui-zip>Download zip</a>
            </p>
          </article>`;
}

export function toolsMarkup(version, base = "") {
  if (!version) throw new Error("toolsMarkup needs the package version");
  return `<div class="tools-feature">${extractorCard()}</div>
          <div class="tools-grid">${webTools.map((t) => webToolCard(t, version, base)).join("")}</div>`;
}
