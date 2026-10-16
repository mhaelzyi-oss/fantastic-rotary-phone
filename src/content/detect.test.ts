import { afterEach, describe, expect, it } from "vitest";
import { collectCandidateUrls, readPlacement, toStubSource } from "./detect";
import { recordNetworkMedia, resetNetworkHits } from "./network";

function box(el: Element, rect: { left: number; top: number; width: number; height: number }) {
  (el as HTMLElement).getBoundingClientRect = () =>
    ({
      x: rect.left,
      y: rect.top,
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
      right: rect.left + rect.width,
      bottom: rect.top + rect.height,
      toJSON() {
        return {};
      },
    }) as DOMRect;
}

afterEach(() => {
  document.body.innerHTML = "";
  resetNetworkHits();
});

describe("visual and audio checks", () => {
  it("marks a hidden player, an off-screen player, and a visible one", () => {
    document.body.innerHTML = `
      <video id="seen" src="https://cdn.example/seen.mp4"></video>
      <video id="gone" src="https://cdn.example/gone.mp4" hidden></video>
      <div style="display:none"><video id="css" src="https://cdn.example/css.mp4"></video></div>
      <video id="out" src="https://cdn.example/out.mp4"></video>
      <audio id="talk" src="https://cdn.example/talk.mp3"></audio>
      <audio id="song" src="https://cdn.example/song.m4a"></audio>
      <audio id="voice" src="https://cdn.example/voice.aac"></audio>
      <video id="pod" src="https://cdn.example/pod.mp3"></video>
      <audio id="piece" src="https://cdn.example/v/seg-1.m4a"></audio>
    `;
    box(document.getElementById("seen")!, { left: 10, top: 10, width: 320, height: 180 });
    box(document.getElementById("out")!, { left: -400, top: 10, width: 320, height: 180 });
    box(document.getElementById("talk")!, { left: 10, top: 10, width: 280, height: 40 });
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 800 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 600 });

    expect(readPlacement(document.getElementById("seen")!)).toBe("visible");
    expect(readPlacement(document.getElementById("gone")!)).toBe("hidden");
    expect(readPlacement(document.getElementById("css")!)).toBe("hidden");
    expect(readPlacement(document.getElementById("out")!)).toBe("offscreen");

    const hits = collectCandidateUrls();
    const byUrl = Object.fromEntries(hits.map((h) => [h.url, h]));
    expect(byUrl["https://cdn.example/seen.mp4"]?.placement).toBe("visible");
    expect(byUrl["https://cdn.example/gone.mp4"]?.placement).toBe("hidden");
    expect(byUrl["https://cdn.example/out.mp4"]?.placement).toBe("offscreen");
    expect(byUrl["https://cdn.example/talk.mp3"]?.medium).toBe("audio");
    expect(byUrl["https://cdn.example/song.m4a"]?.medium).toBe("audio");
    expect(byUrl["https://cdn.example/voice.aac"]?.medium).toBe("audio");
    expect(byUrl["https://cdn.example/pod.mp3"]?.medium).toBe("audio");
    expect(byUrl["https://cdn.example/v/seg-1.m4a"]).toBeUndefined();

    const audio = toStubSource(byUrl["https://cdn.example/talk.mp3"]!, "Show", "https://example.com/watch");
    expect(audio).toMatchObject({ medium: "audio", kind: "progressive", placement: "visible" });
    const locked = toStubSource(byUrl["https://cdn.example/seen.mp4"]!, "Show", "https://www.netflix.com/watch/1");
    expect(locked?.encrypted).toBe(true);
  });

  it("keeps the visible player when a hidden copy shares the url, and sees through a faded parent", () => {
    document.body.innerHTML = `
      <video id="main" src="https://cdn.example/same.mp4"></video>
      <video id="preload" src="https://cdn.example/same.mp4" hidden></video>
      <div style="opacity:0"><video id="fade" src="https://cdn.example/fade.mp4"></video></div>
    `;
    box(document.getElementById("main")!, { left: 10, top: 10, width: 320, height: 180 });
    box(document.getElementById("fade")!, { left: 10, top: 10, width: 320, height: 180 });
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 800 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 600 });
    expect(readPlacement(document.getElementById("fade")!)).toBe("hidden");
    const hits = collectCandidateUrls();
    expect(hits.find((h) => h.url.endsWith("/same.mp4"))?.placement).toBe("visible");
  });

  it("skips hidden players when that scan is off, and still keeps a visible audio file", () => {
    document.body.innerHTML = `
      <video id="seen" src="https://cdn.example/seen.mp4"></video>
      <video id="gone" src="https://cdn.example/gone.mp4" hidden></video>
      <audio id="talk" src="https://cdn.example/talk.mp3"></audio>
    `;
    box(document.getElementById("seen")!, { left: 10, top: 10, width: 320, height: 180 });
    box(document.getElementById("talk")!, { left: 10, top: 10, width: 280, height: 40 });
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 800 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 600 });
    const hits = collectCandidateUrls({ hidden: false });
    const urls = hits.map((h) => h.url);
    expect(urls).toContain("https://cdn.example/seen.mp4");
    expect(urls).toContain("https://cdn.example/talk.mp3");
    expect(urls).not.toContain("https://cdn.example/gone.mp4");
  });

  it("marks a player inside an off-screen frame as off screen", () => {
    const frame = document.createElement("iframe");
    document.body.appendChild(frame);
    const doc = frame.contentDocument;
    expect(doc).toBeTruthy();
    doc!.body.innerHTML = `<video id="inner" src="https://cdn.example/inner.mp4"></video>`;
    box(frame, { left: -500, top: 10, width: 320, height: 180 });
    box(doc!.getElementById("inner")!, { left: 10, top: 10, width: 300, height: 150 });
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 800 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 600 });
    const hit = collectCandidateUrls().find((h) => h.url.includes("/inner.mp4"));
    expect(hit).toMatchObject({ placement: "offscreen", source: "iframe" });
  });

  it("keeps a request that never appears in the page, and keeps file size when the response had one", () => {
    recordNetworkMedia("https://cdn.example/api/clip", "video/mp4", { bytes: 4096, fileName: "clip.mp4" });
    recordNetworkMedia("https://cdn.example/api/bed", "audio/mpeg", { bytes: 1024, fileName: "bed.mp3" });
    const hits = collectCandidateUrls();
    const video = hits.find((h) => h.url.includes("/clip"));
    const audio = hits.find((h) => h.url.includes("/bed"));
    expect(video).toMatchObject({ placement: "network", byteLength: 4096, fileName: "clip.mp4", medium: "video" });
    expect(audio).toMatchObject({ medium: "audio", byteLength: 1024, fileName: "bed.mp3", placement: "network" });
    const stub = toStubSource(video!, "Show", "https://example.com/watch");
    expect(stub).toMatchObject({ byteLength: 4096, sizeEstimate: 4096, fileName: "clip.mp4", placement: "network" });
  });
});
