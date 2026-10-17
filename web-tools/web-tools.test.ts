import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { collectWebToolFiles, writeWebTools } from "../scripts/web-tools-pack.mjs";
import { webTools } from "../site/lib/web-tools.mjs";

const root = resolve("web-tools");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

describe("local-file web tools", () => {
  it("has a classic-script page for each of the seven tools", () => {
    for (const tool of webTools) {
      const htmlPath = join(root, tool.slug, "index.html");
      const appPath = join(root, tool.slug, "app.js");
      expect(existsSync(htmlPath), htmlPath).toBe(true);
      expect(existsSync(appPath), appPath).toBe(true);
      const html = readFileSync(htmlPath, "utf8");
      expect(html).toContain(`<title>${tool.name} | KUI Video Extractor</title>`);
      expect(html).toContain(`<h1>${tool.name}</h1>`);
      expect(html).toContain("KUI Video Extractor");
      expect(html).toMatch(/connect-src 'none'/);
      expect(html).toMatch(/Content-Security-Policy/);
      expect(html).not.toMatch(/type=["']module["']/);
      expect(html).not.toMatch(/fetch\s*\(|XMLHttpRequest|navigator\.sendBeacon/);
      const app = readFileSync(appPath, "utf8");
      expect(app).not.toMatch(/\bimport\s+|export\s+/);
      expect(app).not.toMatch(/fetch\s*\(|XMLHttpRequest|https?:\/\//);
    }
  });

  it("packs each tool with shared scripts for the extension and site zips", () => {
    const dir = mkdtempSync(join(tmpdir(), "kui-tools-"));
    try {
      writeWebTools(dir);
      for (const tool of webTools) {
        const html = join(dir, "tools", tool.slug, "index.html");
        const app = join(dir, "tools", tool.slug, "app.js");
        expect(existsSync(html), html).toBe(true);
        expect(existsSync(app), app).toBe(true);
        expect(existsSync(join(dir, "tools", tool.slug, "shared", "kui.css"))).toBe(true);
        expect(Object.keys(collectWebToolFiles(tool.slug))).toContain("index.html");
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("keeps shared scripts classic, local, and offline", () => {
    const files = walk(join(root, "shared")).filter((f) => f.endsWith(".js"));
    expect(files.length).toBeGreaterThan(2);
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      expect(src, file).not.toMatch(/\bimport\s+|export\s+/);
      expect(src, file).not.toMatch(/fetch\s*\(|XMLHttpRequest|https?:\/\//);
      expect(src, file).not.toMatch(/ffmpeg/i);
    }
  });
});
