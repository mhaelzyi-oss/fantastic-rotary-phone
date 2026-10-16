// Zips dist/ into release/kui-video-extractor-<version>.zip, the file Chrome Web Store and "Load unpacked" users need.
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { zipSync } from "fflate";

const dist = resolve("dist");
if (!existsSync(join(dist, "manifest.json"))) {
  console.error("dist/manifest.json is missing. Run `npm run build` first.");
  process.exit(1);
}

const files = {};
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full);
    else if (!name.endsWith(".map")) files[relative(dist, full).split(sep).join("/")] = new Uint8Array(readFileSync(full));
  }
})(dist);

const { version } = JSON.parse(readFileSync(join(dist, "manifest.json"), "utf8"));
mkdirSync("release", { recursive: true });
const out = join("release", `kui-video-extractor-${version}.zip`);
writeFileSync(out, zipSync(files, { level: 9 }));
console.log(`${out}  (${Object.keys(files).length} files)`);
