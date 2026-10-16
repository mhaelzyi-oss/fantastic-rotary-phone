import { describe, expect, it } from "vitest";
import { addToLibrary, normalizeTags, parseTags, removeFromLibrary, searchLibrary, toLibraryItem, updateLibraryItem } from "./library";
import type { MediaItem } from "./types";

const src = (url: string, title = "Clip"): MediaItem => ({
  url,
  kind: "hls",
  originHost: "cdn.example.com",
  title,
  pageUrl: "https://example.com/p",
  source: "dom",
  encrypted: false,
  variants: [],
  subtitles: [],
});

describe("library", () => {
  it("adds newest first and ignores duplicates", () => {
    let list = addToLibrary([], toLibraryItem(src("https://a/1.m3u8"), 1, "a"));
    list = addToLibrary(list, toLibraryItem(src("https://a/2.m3u8"), 2, "b"));
    expect(addToLibrary(list, toLibraryItem(src("https://a/1.m3u8"), 3, "c"))).toBe(list);
    expect(list.map((i) => i.id)).toEqual(["b", "a"]);
  });

  it("removes and updates", () => {
    let list = addToLibrary([], toLibraryItem(src("https://a/1.m3u8"), 1, "a"));
    list = updateLibraryItem(list, "a", { note: "x".repeat(900), tags: ["Alpha", "alpha", " Beta "] }, 5);
    expect(list[0]?.note).toHaveLength(500);
    expect(list[0]?.tags).toEqual(["alpha", "beta"]);
    expect(list[0]?.updatedAt).toBe(5);
    expect(removeFromLibrary(list, "a")).toEqual([]);
  });

  it("does not blank the title", () => {
    const list = addToLibrary([], toLibraryItem(src("https://a/1.m3u8", "Keep"), 1, "a"));
    expect(updateLibraryItem(list, "a", { title: "" })[0]?.title).toBe("Keep");
  });

  it("searches title, host, tags and note", () => {
    let list = addToLibrary([], toLibraryItem(src("https://a/1.m3u8", "Cooking show"), 1, "a"));
    list = updateLibraryItem(list, "a", { tags: ["recipes"], note: "episode two" });
    expect(searchLibrary(list, "cook")).toHaveLength(1);
    expect(searchLibrary(list, "RECIPES")).toHaveLength(1);
    expect(searchLibrary(list, "episode")).toHaveLength(1);
    expect(searchLibrary(list, "cdn.example")).toHaveLength(1);
    expect(searchLibrary(list, "nothing")).toHaveLength(0);
    expect(searchLibrary(list, "  ")).toHaveLength(1);
  });

  it("parses tags from free text", () => {
    expect(parseTags("a, b  c,,A")).toEqual(["a", "b", "c"]);
    expect(normalizeTags(Array.from({ length: 30 }, (_, i) => `t${i}`))).toHaveLength(12);
  });
});
