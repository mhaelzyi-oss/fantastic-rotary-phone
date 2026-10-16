// Packages the source tree. Run this only after the test suite has passed.
import { createWriteStream, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Zip, ZipPassThrough } from "fflate";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const out = join(root, "kui-video-extractor-codebase.zip");
const skip = new Set([
  "node_modules",
  "dist",
  "dist-firefox",
  "site-dist",
  ".git",
  "test-results",
  "playwright-report",
  "web-ext-artifacts",
  "release",
  "coverage",
]);

const zip = new Zip();
const sink = createWriteStream(out);
zip.ondata = (err, data, final) => {
  if (err) {
    sink.destroy(err);
    return;
  }
  sink.write(data);
  if (final) sink.end();
};

function addTree(dir) {
  for (const name of readdirSync(dir)) {
    if (skip.has(name) || name === "kui-video-extractor-codebase.zip") continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      addTree(full);
      continue;
    }
    const rel = relative(root, full).replaceAll("\\", "/");
    const entry = new ZipPassThrough(rel);
    zip.add(entry);
    entry.push(new Uint8Array(readFileSync(full)), true);
  }
}

addTree(root);
zip.end();
await new Promise((ok, fail) => {
  sink.on("finish", ok);
  sink.on("error", fail);
});
console.log(out);
