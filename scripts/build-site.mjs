// Builds a static site from site/ plus the latest release zip, checksums, and store listings.
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { zipSync } from "fflate";
import { collectWebToolFiles } from "./web-tools-pack.mjs";
import { toolsMarkup, webTools, zipName } from "../site/lib/web-tools.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const VERSION = pkg.version;
const SITE_URL = (process.env.SITE_URL ?? "https://kui.video").replace(/\/$/, "");
const CONTACT_EMAIL = process.env.CONTACT_EMAIL ?? "kryptonsixxoutkook@gmail.com";
const CHROME_STORE_URL = process.env.CHROME_STORE_URL ?? "";
const EDGE_STORE_URL = process.env.EDGE_STORE_URL ?? "";
const FIREFOX_STORE_URL = process.env.FIREFOX_STORE_URL ?? "";
const BUILD_DATE = new Date().toISOString().slice(0, 10);
const out = join(root, "site-dist");

const header = readFileSync(join(root, "site", "partials", "header.html"), "utf8");
const footer = readFileSync(join(root, "site", "partials", "footer.html"), "utf8");

function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

function zipDirSync(dir) {
  const files = {};
  (function walk(d, prefix) {
    for (const name of readdirSync(d)) {
      const full = join(d, name);
      const rel = prefix ? `${prefix}/${name}` : name;
      if (statSync(full).isDirectory()) walk(full, rel);
      else if (!name.endsWith(".map")) files[rel] = new Uint8Array(readFileSync(full));
    }
  })(dir, "");
  return zipSync(files, { level: 9 });
}

rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, "downloads"), { recursive: true });
mkdirSync(join(out, ".well-known"), { recursive: true });
mkdirSync(join(out, "fonts"), { recursive: true });

const downloads = [];
function addZipBytes(file, bytes) {
  writeFileSync(join(out, "downloads", file), bytes);
  downloads.push({ file, bytes, hash: sha256(bytes), size: bytes.length });
}

function addZip(name, dir) {
  if (!existsSync(join(dir, "manifest.json"))) {
    console.error(`${dir} is missing. Run the matching build first.`);
    process.exit(1);
  }
  addZipBytes(`${name}-${VERSION}.zip`, zipDirSync(dir));
}

addZip("kui-video-extractor", join(root, "dist"));
if (existsSync(join(root, "dist-firefox", "manifest.json"))) addZip("kui-video-extractor-firefox", join(root, "dist-firefox"));

for (const tool of webTools) {
  const files = collectWebToolFiles(tool.slug);
  if (!files["index.html"]) {
    console.error(`web-tools/${tool.slug} is missing index.html`);
    process.exit(1);
  }
  addZipBytes(zipName(tool.slug, VERSION), zipSync(files, { level: 9 }));
}

const sums = downloads.map((d) => `${d.hash}  ${d.file}`).join("\n") + "\n";
writeFileSync(join(out, "downloads", "SHA256SUMS.txt"), sums);

function store(href, label) {
  if (!href) return "";
  return `<a class="store" href="${href}" rel="noopener">${label}</a>`;
}

const badges = [store(CHROME_STORE_URL, "Chrome"), store(EDGE_STORE_URL, "Edge"), store(FIREFOX_STORE_URL, "Firefox")].join("");

function fmtSize(n) {
  return n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
}

const chromium = downloads.find((d) => d.file === `kui-video-extractor-${VERSION}.zip`);
const firefox = downloads.find((d) => d.file === `kui-video-extractor-firefox-${VERSION}.zip`);
function card(d, title, steps) {
  if (!d) return `<div class="card"><h3>${title}</h3><p class="muted">Build not present.</p></div>`;
  return `<div class="card">
            <h3>${title}</h3>
            <p><a class="btn btn-dark small" href="/downloads/${d.file}" download>Download ${d.file}</a></p>
            <p class="hash">SHA-256 ${d.hash}<br />${fmtSize(d.size)} &middot; v${VERSION}</p>
            <ol>${steps.map((s) => `<li>${s}</li>`).join("")}</ol>
          </div>`;
}
const downloadCards = [
  card(chromium, "Chrome, Edge, Brave", [
    "Open the extensions page (chrome://extensions, edge://extensions, or brave://extensions).",
    "Turn on Developer mode.",
    "Unzip the download. Choose Load unpacked and select that folder.",
  ]),
  card(firefox, "Firefox", [
    "Open about:debugging#/runtime/this-firefox.",
    "Choose Load Temporary Add-on and pick the unzipped <code>manifest.json</code>.",
    "A signed listing on addons.mozilla.org is needed for a permanent install.",
  ]),
].join("");

function page(src, dest) {
  let html = readFileSync(join(root, "site", src), "utf8");
  html = html
    .replaceAll("{{HEADER}}", header)
    .replaceAll("{{FOOTER}}", footer)
    .replaceAll("{{VERSION}}", VERSION)
    .replaceAll("{{SITE_URL}}", SITE_URL)
    .replaceAll("{{CONTACT_EMAIL}}", CONTACT_EMAIL)
    .replaceAll("{{BUILD_DATE}}", BUILD_DATE)
    .replaceAll("{{BADGES}}", badges)
    .replaceAll("{{DOWNLOADS}}", downloadCards)
    .replaceAll("{{TOOLS}}", toolsMarkup(VERSION));
  if (html.includes("{{KICKER}}")) {
    console.error(`${src} still has {{KICKER}}`);
    process.exit(1);
  }
  const destPath = join(out, dest);
  mkdirSync(dirname(destPath), { recursive: true });
  writeFileSync(destPath, html);
}

page("index.html", "index.html");
page("privacy.html", "privacy.html");
page("security.html", "security.html");
page("404.html", "404.html");
for (const tool of webTools) {
  page(`tools/${tool.slug}/index.html`, `tools/${tool.slug}/index.html`);
}

copyFileSync(join(root, "site", "style.css"), join(out, "style.css"));
const siteMark = join(root, "public", "icons", "logo.svg");
copyFileSync(existsSync(siteMark) ? siteMark : join(root, "branding", "krypton-ultimate-inc-ii.svg"), join(out, "logo.svg"));
copyFileSync(join(root, "branding", "krypton-ultimate-inc-ii.svg"), join(out, "publisher.svg"));

const fontSrc = join(root, "node_modules", "@fontsource-variable", "instrument-sans", "files", "instrument-sans-latin-wght-normal.woff2");
if (existsSync(fontSrc)) copyFileSync(fontSrc, join(out, "fonts", "instrument-sans-latin.woff2"));

writeFileSync(
  join(out, ".well-known", "security.txt"),
  `Contact: mailto:${CONTACT_EMAIL}
Expires: ${new Date(Date.now() + 365 * 86_400_000).toISOString()}
Preferred-Languages: en
Canonical: ${SITE_URL}/.well-known/security.txt
Policy: ${SITE_URL}/security.html
Acknowledgments: ${SITE_URL}/security.html
`,
);

writeFileSync(
  join(out, "robots.txt"),
  `User-agent: *
Allow: /
Sitemap: ${SITE_URL}/sitemap.xml
`,
);

const toolUrls = webTools.map((t) => `  <url><loc>${SITE_URL}/tools/${t.slug}/</loc><lastmod>${BUILD_DATE}</lastmod></url>`).join("\n");
writeFileSync(
  join(out, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${SITE_URL}/</loc><lastmod>${BUILD_DATE}</lastmod></url>
  <url><loc>${SITE_URL}/privacy.html</loc><lastmod>${BUILD_DATE}</lastmod></url>
  <url><loc>${SITE_URL}/security.html</loc><lastmod>${BUILD_DATE}</lastmod></url>
${toolUrls}
</urlset>
`,
);

writeFileSync(
  join(out, "_headers"),
  `/*
  Content-Security-Policy: default-src 'none'; script-src 'none'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action mailto:; frame-ancestors 'none'; upgrade-insecure-requests
  Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: no-referrer
  Permissions-Policy: accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Resource-Policy: same-origin
  X-Permitted-Cross-Domain-Policies: none
  Cache-Control: public, max-age=600

/downloads/*
  Content-Disposition: attachment
  Cache-Control: public, max-age=31536000, immutable
  X-Content-Type-Options: nosniff
`,
);
writeFileSync(join(out, "_redirects"), `/home / 301\n`);

const toolLines = webTools.map((t) => `- ${t.name}: ${t.summary}`).join("\n");
writeFileSync(
  join(out, "store-listings.md"),
  `# Store listings (paste these into each dashboard)

Short description (Chrome / Edge, 132 characters):
KUI Video Extractor finds the video on a page and saves it. No account.

Firefox summary (250 characters):
Find the video playing on a page and save it. Direct files download as they are. Streamed video is joined into one file. There is no account.

Detailed description:

KUI Video Extractor by Krypton Ultimate Inc II finds public video on the page you are watching and lets you save it.

Extractor
- The browser extension. Find the public file on this page and save it.

Local file tools (download a zip, unzip, open index.html — they never upload the file):
${toolLines}

Saving
- Direct files (MP4 and similar) go to your Downloads folder.
- HLS is fetched by the page itself and joined in order into one file.
- DASH and players that feed video from memory get a command instead of a button, because they cannot be joined in the browser.

Command line
- yt-dlp, ffmpeg, streamlink, N_m3u8DL-RE, curl, wget and aria2, quoted for bash, PowerShell and cmd.
- Batch scripts for a whole selection.
- Audio-only is a command-line flag for ffmpeg and yt-dlp, not a separate product.

Your data
- No account and no server. Settings, history, saved list and a small log stay on this device.
- History and the log are deleted after 30 days. One button in Settings erases everything.
- See ${SITE_URL}/privacy.html

What it will not do
- It does not record a live stream that has not ended.
- Save only media you own, have a licence for, or that the site offers for download.

Privacy policy: ${SITE_URL}/privacy.html
Security: ${SITE_URL}/security.html
`,
);

writeFileSync(join(out, "CNAME"), new URL(SITE_URL).host + "\n");

console.log(`site-dist/  v${VERSION}  ${downloads.map((d) => d.file).join(", ")}`);
