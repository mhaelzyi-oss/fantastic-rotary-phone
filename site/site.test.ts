import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const dist = resolve("site-dist");
const skip = !existsSync(join(dist, "index.html"));

describe.skipIf(skip)("published site", () => {
  const html = (name: string) => readFileSync(join(dist, name), "utf8");

  it("ships no scripts, no inline event handlers and no third-party URLs", () => {
    const pages = [
      "index.html",
      "privacy.html",
      "security.html",
      "404.html",
      "tools/convert/index.html",
      "tools/compress/index.html",
      "tools/trim/index.html",
      "tools/merge/index.html",
      "tools/gif/index.html",
      "tools/audio/index.html",
      "tools/add-audio/index.html",
    ];
    for (const name of pages) {
      const page = html(name);
      expect(page, name).not.toMatch(/<script[\s>]/i);
      expect(page, name).not.toMatch(/\son[a-z]+\s*=/i);
      expect(page, name).not.toMatch(/<(?:script|iframe|object|embed|link rel="preconnect"|img[^>]+src="https?:)/i);
      expect(page, name).not.toMatch(/src="https?:\/\//i);
      expect(page, name).not.toMatch(/href="https?:\/\/(?!kui\.video)[^"]+"/i);
      expect(page, name).not.toMatch(/\{\{[A-Z_]+\}\}/);
    }
  });

  it("declares no cookies, no account and no analytics, in words a reader can find", () => {
    const privacy = html("privacy.html");
    expect(privacy).toMatch(/no account/i);
    expect(privacy).toMatch(/No cookies/);
    expect(privacy).toMatch(/No analytics/);
    expect(privacy).toMatch(/30 days/);
    expect(privacy).toMatch(/Erase all data/);
  });

  it("has a CSP that forbids scripts, and a security.txt", () => {
    const headers = readFileSync(join(dist, "_headers"), "utf8");
    expect(headers).toMatch(/script-src 'none'/);
    expect(headers).toMatch(/frame-ancestors 'none'/);
    expect(headers).toMatch(/default-src 'none'/);
    const txt = readFileSync(join(dist, ".well-known", "security.txt"), "utf8");
    expect(txt).toMatch(/^Contact: mailto:/m);
    expect(txt).toMatch(/^Expires: /m);
  });

  it("publishes checksums that match the zips beside them", async () => {
    const { createHash } = await import("node:crypto");
    const sums = readFileSync(join(dist, "downloads", "SHA256SUMS.txt"), "utf8").trim().split(/\n/);
    expect(sums.length).toBeGreaterThanOrEqual(1);
    for (const line of sums) {
      const [hash, file] = line.split(/\s+/);
      const bytes = readFileSync(join(dist, "downloads", file as string));
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(hash);
    }
  });

  it("is a short page for kui.video, with the newsletter and no lecture copy", () => {
    const home = html("index.html");
    expect(home).toMatch(/https:\/\/kui\.video\//);
    expect(home).toMatch(/Stay in the loop/);
    expect(home).toMatch(/This opens your email app\./);
    expect(home).not.toMatch(/>kryptonsixxoutkook@gmail\.com</);
    expect(html("privacy.html")).not.toMatch(/>kryptonsixxoutkook@gmail\.com</);
    expect(html("security.html")).not.toMatch(/>kryptonsixxoutkook@gmail\.com</);
    expect(html("404.html")).not.toMatch(/>kryptonsixxoutkook@gmail\.com</);
    expect(home).not.toMatch(/DRM/i);
    expect(html("privacy.html")).not.toMatch(/DRM/i);
    expect(html("security.html")).not.toMatch(/DRM/i);
    const css = readFileSync(join(dist, "style.css"), "utf8");
    expect(css).toMatch(/#c9a227/i);
    expect(css).not.toMatch(/#2563eb/i);
  });

  it("lists Extractor plus the seven local-file tools, not Detect/Analyze/etc", () => {
    const home = html("index.html");
    const section = home.match(/<section[^>]*\sid="tools"[\s\S]*?<\/section>/)?.[0] ?? "";
    expect(section).toMatch(/id="tool-extractor"/);
    expect(section).toContain("Install extension");
    const slugs = ["convert", "compress", "trim", "merge", "gif", "audio", "add-audio"];
    for (const slug of slugs) {
      expect(section.match(new RegExp(`id="tool-${slug}"`, "g"))).toHaveLength(1);
      expect(section).toContain(`/tools/${slug}/`);
      expect(section).toContain(`kui-tool-${slug}-`);
      expect(section).toContain("Open page");
      expect(section).toContain("Download zip");
    }
    expect(section.match(/id="tool-[a-z0-9-]+"/g)).toHaveLength(8);
    expect(section).not.toMatch(/id="tool-(detect|analyze|quality|library|names|subs)"/);
    expect(section).not.toMatch(/HLS player|\bCast\b/);
    expect(section).not.toMatch(/class="steps"/);
    expect(home).not.toMatch(/\{\{TOOLS\}\}|\{\{KICKER\}\}/);
    expect(existsSync(join(dist, "downloads", "kui-tool-convert-1.2.0.zip"))).toBe(true);
  });

  it("bundles its own font and logo, so it never fetches them from elsewhere", () => {
    expect(existsSync(join(dist, "logo.svg"))).toBe(true);
    expect(existsSync(join(dist, "publisher.svg"))).toBe(true);
    expect(html("index.html")).toMatch(/src="\/publisher\.svg"/);
    expect(html("index.html")).not.toMatch(/class="store off"/);
    expect(existsSync(join(dist, "fonts", "instrument-sans-latin.woff2"))).toBe(true);
    const css = readFileSync(join(dist, "style.css"), "utf8");
    expect(css).toMatch(/url\("\/fonts\/instrument-sans-latin\.woff2"\)/);
    expect(css).not.toMatch(/url\(\s*["']?https?:\/\//);
  });
});
