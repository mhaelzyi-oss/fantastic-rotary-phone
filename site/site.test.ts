import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const dist = resolve("site-dist");
const skip = !existsSync(join(dist, "index.html"));

describe.skipIf(skip)("published site", () => {
  const html = (name: string) => readFileSync(join(dist, name), "utf8");

  it("ships no scripts, no inline event handlers and no third-party URLs", () => {
    for (const name of ["index.html", "privacy.html", "security.html", "404.html"]) {
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

  it("bundles its own font and logo, so it never fetches them from elsewhere", () => {
    expect(existsSync(join(dist, "logo.svg"))).toBe(true);
    expect(existsSync(join(dist, "fonts", "instrument-sans-latin.woff2"))).toBe(true);
    const css = readFileSync(join(dist, "style.css"), "utf8");
    expect(css).toMatch(/url\("\/fonts\/instrument-sans-latin\.woff2"\)/);
    expect(css).not.toMatch(/url\(\s*["']?https?:\/\//);
  });
});
