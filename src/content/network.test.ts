import { afterEach, describe, expect, it, vi } from "vitest";
import { networkHits, recordNetworkMedia, resetNetworkHits, startNetworkWatch } from "./network";

afterEach(() => resetNetworkHits());

describe("recordNetworkMedia", () => {
  it("accepts a media type on an extensionless address and ignores segments and non-http", () => {
    expect(recordNetworkMedia("https://cdn.example.com/api/v/1", "video/mp4")).toBe(true);
    expect(recordNetworkMedia("https://cdn.example.com/api/hls/play", "application/vnd.apple.mpegurl")).toBe(true);
    expect(recordNetworkMedia("https://cdn.example.com/api/bed", "audio/mpeg", { bytes: 2048, fileName: "bed.mp3" })).toBe(true);
    expect(recordNetworkMedia("https://cdn.example.com/seg-1.ts", "video/mp2t")).toBe(false);
    expect(recordNetworkMedia("https://cdn.example.com/song.m4a", "audio/mp4")).toBe(true);
    expect(recordNetworkMedia("https://cdn.example.com/segments/song.aac", "audio/aac")).toBe(true);
    expect(recordNetworkMedia("https://cdn.example.com/v/seg-1.m4a", "audio/mp4")).toBe(false);
    expect(recordNetworkMedia("https://cdn.example.com/v/chunk-2.mp3", "audio/mpeg")).toBe(false);
    expect(recordNetworkMedia("https://cdn.example.com/page", "text/html")).toBe(false);
    expect(recordNetworkMedia("blob:https://example.com/x", "video/mp4")).toBe(false);
    expect(networkHits().map((h) => h.url)).toEqual([
      "https://cdn.example.com/api/v/1",
      "https://cdn.example.com/api/hls/play",
      "https://cdn.example.com/api/bed",
      "https://cdn.example.com/song.m4a",
      "https://cdn.example.com/segments/song.aac",
    ]);
    expect(networkHits().find((h) => h.url.endsWith("/bed"))).toMatchObject({ bytes: 2048, fileName: "bed.mp3" });
  });
});

// jsdom delivers window.postMessage without setting `source`, which a browser always sets. Do what a browser does.
function browserLikePostMessage() {
  vi.spyOn(window, "postMessage").mockImplementation(((data: unknown) => {
    setTimeout(() => window.dispatchEvent(new MessageEvent("message", { data, source: window, origin: window.location.origin })), 0);
  }) as typeof window.postMessage);
}

describe("hook and content script meet in either order", () => {
  it("a stream the page fetched BEFORE the content script started is still found", async () => {
    browserLikePostMessage();
    // The page-world hook is installed first, as at document_start.
    vi.stubGlobal("fetch", vi.fn(async () => ({ url: "https://cdn.example.com/api/early", headers: new Headers({ "content-type": "video/mp4" }) })));
    window.fetch = globalThis.fetch;
    await import("./hook");
    await window.fetch("https://cdn.example.com/api/early");
    // Let the first report be delivered to nobody (no listener yet).
    await new Promise((r) => setTimeout(r, 20));
    expect(networkHits()).toHaveLength(0);

    // The content script starts later and asks for a replay.
    const onNew = vi.fn();
    const stop = startNetworkWatch(onNew);
    await vi.waitFor(() => expect(networkHits().map((h) => h.url)).toContain("https://cdn.example.com/api/early"));
    expect(onNew).toHaveBeenCalled();
    stop();
  });

  it("copies size and filename from headers the page already received", () => {
    const stop = startNetworkWatch(() => undefined);
    window.dispatchEvent(
      new MessageEvent("message", {
        data: {
          source: "vpf-hook",
          url: "https://cdn.example.com/api/bed",
          mime: "audio/mpeg",
          bytes: 1024,
          disposition: "attachment; filename*=UTF-8'en'bed.mp3",
        },
        source: window,
      }),
    );
    expect(networkHits()[0]).toMatchObject({ bytes: 1024, fileName: "bed.mp3", mime: "audio/mpeg" });
    stop();
  });

  it("ignores messages that did not come from this window", async () => {
    browserLikePostMessage();
    const stop = startNetworkWatch(() => undefined);
    window.dispatchEvent(new MessageEvent("message", { data: { source: "vpf-hook", url: "https://evil.example.net/x", mime: "video/mp4" }, source: null }));
    await new Promise((r) => setTimeout(r, 20));
    expect(networkHits().map((h) => h.url)).not.toContain("https://evil.example.net/x");
    stop();
  });
});
