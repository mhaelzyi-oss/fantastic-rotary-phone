import { readFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

const MPEGURL = "application/vnd.apple.mpegurl";
const SEGMENTS = 3;
const SEGMENT_BYTES = 188 * 10;

/** One transport-stream-sized chunk: ten 188-byte packets, each tagged with the segment and packet number. */
function segment(n: number): Buffer {
  const out = Buffer.alloc(SEGMENT_BYTES, 0xaa);
  for (let p = 0; p < 10; p++) {
    out[p * 188] = 0x47;
    out[p * 188 + 1] = n;
    out[p * 188 + 2] = p;
  }
  return out;
}

function playlist(seg: (i: number) => string, opts: { endlist?: boolean; key?: boolean } = {}): string {
  const lines = ["#EXTM3U", "#EXT-X-VERSION:3", "#EXT-X-TARGETDURATION:2", "#EXT-X-MEDIA-SEQUENCE:0"];
  if (opts.key) lines.push('#EXT-X-KEY:METHOD=AES-128,URI="https://keys.example.com/k"');
  for (let i = 0; i < SEGMENTS; i++) lines.push("#EXTINF:2.0,", seg(i));
  if (opts.endlist !== false) lines.push("#EXT-X-ENDLIST");
  return lines.join("\n") + "\n";
}

/**
 * Serves media from URLs with NO file extension and a real content-type, the way streaming sites do.
 * Detection of these depends on the response type, not the address.
 */
function mediaApi(): Plugin {
  const sample = readFileSync(resolve("demo/media/sample.mp4"));
  return {
    name: "harness-media-api",
    configureServer(server) {
      server.middlewares.use((req: IncomingMessage, res: ServerResponse, next) => {
        const path = (req.url ?? "").split("?")[0] ?? "";
        const send = (type: string, body: string | Buffer, status = 200) => {
          res.writeHead(status, { "content-type": type, "cache-control": "no-store" }).end(body);
        };
        if (path === "/api/video/1") return send("video/mp4", sample);
        if (path === "/api/hls/vod") return send(MPEGURL, playlist((i) => `/api/hls/seg-${i}.ts`));
        if (path === "/api/hls/live") return send(MPEGURL, playlist((i) => `/api/hls/seg-${i}.ts`, { endlist: false }));
        if (path === "/api/hls/enc") return send(MPEGURL, playlist((i) => `/api/hls/seg-${i}.ts`, { key: true }));
        if (path === "/api/hls/broken") return send(MPEGURL, playlist((i) => `/api/hls/gone-${i}.ts`));
        const m = /^\/api\/hls\/seg-(\d+)\.ts$/.exec(path);
        if (m) return send("video/mp2t", segment(Number(m[1])));
        if (path.startsWith("/api/hls/gone-")) return send("text/plain", "gone", 404);
        next();
      });
    },
  };
}

/** Serves the test harness: real content script + real UI + real background modules, with the demo media as static files. */
export default defineConfig({
  root: "harness",
  publicDir: "../demo",
  plugins: [react(), mediaApi()],
  esbuild: { target: "esnext" },
  optimizeDeps: { esbuildOptions: { target: "esnext" } },
  server: { host: "127.0.0.1", port: 4178, strictPort: true },
});
