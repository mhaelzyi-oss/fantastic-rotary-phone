import { describe, expect, it } from "vitest";
import { webTools as extTools } from "../../src/shared/webTools";
import { extractor, FORBIDDEN_PRODUCT_NAMES, toolChrome, toolsFooter, toolsMarkup, toolsNav, webTools, zipName } from "./web-tools.mjs";

describe("web tools catalog", () => {
  it("ships Extractor plus exactly seven local-file tools", () => {
    const slugs = webTools.map((t) => t.slug);
    const names = webTools.map((t) => t.name);
    expect(extractor.slug).toBe("extractor");
    expect(extractor.kind).toBe("extension");
    expect(slugs).toEqual(["convert", "compress", "trim", "merge", "gif", "audio", "add-audio"]);
    expect(names).toEqual([
      "Video Converter",
      "Video Compressor",
      "Video Trimmer",
      "Video Merger",
      "Video to GIF",
      "Audio Extractor",
      "Add Music",
    ]);
    expect(new Set(slugs).size).toBe(7);
    expect(new Set(names).size).toBe(7);
    expect(slugs).not.toContain("extractor");
    expect(extTools.map((t) => t.slug)).toEqual(slugs);
    expect(extTools.map((t) => t.name)).toEqual(names);
  });

  it("does not list Detect, Analyze, Quality, Library, Names, Subs, HLS player, or Cast as products", () => {
    const blob = [extractor, ...webTools]
      .map((t) => `${t.slug} ${t.name} ${t.kicker} ${t.summary}`)
      .join("\n");
    for (const name of FORBIDDEN_PRODUCT_NAMES) {
      expect(blob).not.toMatch(new RegExp(`\\b${name}\\b`));
    }
    expect(blob.toLowerCase()).not.toMatch(/\bhls player\b|\bcast\b/);
  });

  it("renders one Open card per web tool, with no zip and no extractor card", () => {
    const html = toolsMarkup("1.2.0");
    expect(html).not.toContain("Download zip");
    expect(html).not.toMatch(/id="tool-extractor"/);
    for (const tool of webTools) {
      expect(html.match(new RegExp(`id="tool-${tool.slug}"`, "g"))).toHaveLength(1);
      expect(html).toContain(`>${tool.name}<`);
      expect(html).toContain(`/tools/${tool.slug}/`);
      expect(html).toContain(">Open<");
    }
    expect(html.match(/id="tool-[a-z0-9-]+"/g)).toHaveLength(7);
    expect(html).not.toMatch(/type="module"|<script/i);
    const nested = toolsMarkup("1.2.0", "/fantastic-rotary-phone");
    expect(nested).toContain("/fantastic-rotary-phone/tools/convert/");
    expect(zipName("convert", "1.2.0")).toBe("kui-tool-convert-1.2.0.zip");
  });

  it("puts the seven tools in the Tools menu and footer groups, and a Start plus Get extension chrome on a tool page", () => {
    const nav = toolsNav("/app");
    const foot = toolsFooter("/app");
    const chrome = toolChrome(webTools[0], "1.2.0", "/app");
    expect(nav).toContain("<summary>Tools</summary>");
    expect(foot).toContain("Video tools");
    expect(foot).toContain("Audio");
    expect(chrome).toContain("Start converting");
    expect(chrome).toContain("Get extension");
    expect(chrome).not.toContain("Download zip");
    expect(chrome).not.toContain("All tools");
    for (const tool of webTools) {
      expect(nav).toContain(`/app/tools/${tool.slug}/`);
      expect(nav).toContain(tool.summary);
      expect(foot).toContain(`/app/tools/${tool.slug}/`);
    }
  });

  it("names zips kui-tool-<slug>-VERSION.zip", () => {
    expect(zipName("add-audio", "1.2.0")).toBe("kui-tool-add-audio-1.2.0.zip");
  });
});
