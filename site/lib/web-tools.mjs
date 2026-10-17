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
    kicker: "Free tool",
    start: "Start converting",
    summary: "Wrap a local video as a clean MP4. Same codec. No upload.",
  },
  {
    slug: "compress",
    name: "Video Compressor",
    short: "Compressor",
    kicker: "Free tool",
    start: "Start compressing",
    summary: "Re-encode a local video to a smaller file in this browser.",
  },
  {
    slug: "trim",
    name: "Video Trimmer",
    short: "Trimmer",
    kicker: "Free tool",
    start: "Start trimming",
    summary: "Keep a time range from a local video.",
  },
  {
    slug: "merge",
    name: "Video Merger",
    short: "Merger",
    kicker: "Free tool",
    start: "Start merging",
    summary: "Join local clips with matching codecs into one file.",
  },
  {
    slug: "gif",
    name: "Video to GIF",
    short: "GIF",
    kicker: "Free tool",
    start: "Start GIF",
    summary: "Turn a local clip into a GIF.",
  },
  {
    slug: "audio",
    name: "Audio Extractor",
    short: "Audio",
    kicker: "Free tool",
    start: "Start extracting",
    summary: "Pull the audio track from a local video.",
  },
  {
    slug: "add-audio",
    name: "Add Music",
    short: "Music",
    kicker: "Free tool",
    start: "Start mixing",
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

function icon(kind) {
  const common = 'viewBox="0 0 48 48" width="40" height="40" aria-hidden="true"';
  if (kind === "extractor") {
    return `<svg ${common} fill="none" stroke="#c9a227" stroke-width="2.2" stroke-linejoin="round"><path d="M24 6 40 16v16L24 42 8 32V16z"/><path d="M18 16v16m0-8 12-8M18 24l13 8"/></svg>`;
  }
  const marks = {
    convert: '<rect x="8" y="12" width="14" height="18" rx="2"/><path d="M24 24h6m0 0-3-3m3 3-3 3"/><rect x="32" y="12" width="8" height="18" rx="2"/>',
    compress: '<rect x="10" y="10" width="28" height="28" rx="4"/><path d="M18 24h12M24 18v12"/>',
    trim: '<path d="M14 10v28M34 10v28M14 24h20"/><path d="M10 18h8M30 30h8"/>',
    merge: '<path d="M12 14h10v20H12zM26 14h10v20H26z"/><path d="M22 24h4"/>',
    gif: '<rect x="8" y="12" width="32" height="24" rx="4"/><path d="M16 28c4-8 12-8 16 0"/>',
    audio: '<path d="M18 16v16l14-8z"/>',
    "add-audio": '<rect x="8" y="14" width="20" height="20" rx="3"/><path d="M32 18v12m0-12c4 2 4 8 0 12"/>',
  };
  return `<svg ${common} fill="none" stroke="#c9a227" stroke-width="2.2" stroke-linejoin="round">${marks[kind] || ""}</svg>`;
}

function extractorCard() {
  return `<article class="tool glass featured" id="tool-${extractor.slug}">
            <p class="tool-icon">${icon("extractor")}</p>
            <p class="tool-kicker">${esc(extractor.kicker)}</p>
            <h3>${esc(extractor.name)}</h3>
            <p class="muted">${esc(extractor.summary)}</p>
            <p class="tool-actions"><a class="btn btn-blue small" href="#install">Get extension</a></p>
          </article>`;
}

function webToolCard(tool, version, base = "") {
  const zip = zipName(tool.slug, version);
  return `<article class="tool glass" id="tool-${tool.slug}">
            <p class="tool-icon">${icon(tool.slug)}</p>
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

export function toolsNav(base = "") {
  const items = [
    `<a href="${base}/#install">Extractor</a>`,
    ...webTools.map((t) => `<a href="${base}/tools/${t.slug}/">${esc(t.name)}</a>`),
  ];
  return `<details class="nav-menu">
    <summary>Tools</summary>
    <div class="nav-panel glass">${items.join("")}</div>
  </details>`;
}

export function toolsFooter(base = "") {
  return webTools.map((t) => `<a href="${base}/tools/${t.slug}/">${esc(t.short)}</a>`).join("");
}

export function toolPageExtras(slug, version, base = "") {
  const tool = webTools.find((t) => t.slug === slug);
  if (!tool) throw new Error(`unknown tool ${slug}`);
  const others = webTools.filter((t) => t.slug !== slug);
  return `<section class="block wrap tool-guide">
            <h2>How it works</h2>
            <div class="steps">
              <div class="step glass"><h3>Choose a file</h3><p class="muted">Drop it on this page. It never leaves this browser.</p></div>
              <div class="step glass"><h3>Run</h3><p class="muted">${esc(tool.summary)}</p></div>
              <div class="step glass"><h3>Save</h3><p class="muted">Download the result to this device.</p></div>
            </div>
          </section>
          <section class="block wrap">
            <h2>Why it runs here</h2>
            <div class="grid3">
              <div class="card glass"><h3>No upload</h3><p class="muted">The file stays on this device.</p></div>
              <div class="card glass"><h3>No account</h3><p class="muted">Nothing is sent to us.</p></div>
              <div class="card glass"><h3>Private</h3><p class="muted">Only this browser reads the file you pick.</p></div>
            </div>
          </section>
          <section class="block wrap" id="more-tools">
            <h2>More tools</h2>
            <div class="tools-grid">${others.map((t) => webToolCard(t, version, base)).join("")}</div>
          </section>
          <section class="block wrap">
            <div class="final glass">
              <h2>Need the extractor?</h2>
              <p class="muted">Find the public file on a page and save it.</p>
              <a class="btn btn-blue" href="${base}/#install">Get extension</a>
            </div>
          </section>`;
}

export function toolChrome(tool, version, base = "") {
  return `<p class="tool-chrome wrap">
    <a class="btn btn-blue small" href="#drop">${esc(tool.start)}</a>
    <a class="btn btn-dark small" href="${base}/#install">Get extension</a>
    <a class="btn btn-ghost small" href="${base}/#tools">All tools</a>
    <a class="btn btn-ghost small" href="${base}/downloads/${zipName(tool.slug, version)}" download data-kui-zip>Download zip</a>
  </p>`;
}
