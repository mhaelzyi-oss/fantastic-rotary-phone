// Packs web-tools/ into the same per-slug layout the site zips and the extension pages share.
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { webTools } from "../site/lib/web-tools.mjs";

const root = resolve(process.cwd());

export function collectDir(dir, prefix, files) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    if (name.endsWith(".test.ts") || name.endsWith(".md")) continue;
    const full = join(dir, name);
    const rel = prefix ? `${prefix}/${name}` : name;
    if (statSync(full).isDirectory()) collectDir(full, rel, files);
    else files[rel.replaceAll("\\", "/")] = new Uint8Array(readFileSync(full));
  }
}

export function collectWebToolFiles(slug) {
  const files = {};
  collectDir(join(root, "web-tools", "shared"), "shared", files);
  collectDir(join(root, "web-tools", "vendor"), "vendor", files);
  collectDir(join(root, "web-tools", slug), "", files);
  return files;
}

export function writeWebTools(destRoot) {
  for (const tool of webTools) {
    const files = collectWebToolFiles(tool.slug);
    if (!files["index.html"]) throw new Error(`web-tools/${tool.slug} is missing index.html`);
    for (const [rel, bytes] of Object.entries(files)) {
      const out = join(destRoot, "tools", tool.slug, rel);
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, bytes);
    }
  }
}
