// Copies dist/ (the Chromium build) to dist-firefox/ and rewrites its manifest for Firefox.
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { toFirefoxManifest } from "./targets.mjs";

const src = resolve("dist");
const out = resolve("dist-firefox");
if (!existsSync(join(src, "manifest.json"))) {
  console.error("dist/manifest.json is missing. Run `npm run build` first.");
  process.exit(1);
}
rmSync(out, { recursive: true, force: true });
cpSync(src, out, { recursive: true });
const manifest = JSON.parse(readFileSync(join(src, "manifest.json"), "utf8"));
writeFileSync(join(out, "manifest.json"), JSON.stringify(toFirefoxManifest(manifest), null, 2));
console.log("dist-firefox/ written");
