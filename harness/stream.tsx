import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../src/ui/tokens.css";
import "./harness.css";
import { installChromeMock } from "./chromeMock";

// In the extension this runs first, in the page's own world, before any page script.
await import("../src/content/hook");

const params = new URLSearchParams(location.search);
const mock = installChromeMock();

// Players start early. In the real extension the content script is not running yet when these requests happen,
// so the harness does the same: media first, content script after.
// The "player": loads media the way a site's own script would.
const which = params.get("case") ?? "all";
if (which === "blob") {
  const video = document.querySelector<HTMLVideoElement>("#player")!;
  video.src = URL.createObjectURL(new Blob([new Uint8Array(64)], { type: "video/mp4" }));
} else {
  void fetch("/api/video/1").then((r) => r.arrayBuffer());
  void fetch("/api/hls/vod").then((r) => r.text());
  const xhr = new XMLHttpRequest();
  xhr.open("GET", "/api/hls/live");
  xhr.send();
  void fetch("/api/hls/enc").then((r) => r.text());
  void fetch("/api/hls/broken").then((r) => r.text());
}


await new Promise((r) => setTimeout(r, 300));
await import("../src/content/index");
mock.enterUiPhase();
const { FinderApp } = await import("../src/ui/components/FinderApp");

const root = document.querySelector("#ui");
if (!root) throw new Error("Missing #ui");
createRoot(root).render(
  <StrictMode>
    <FinderApp layout="popup" />
  </StrictMode>,
);
