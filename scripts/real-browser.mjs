// Loads the BUILT extension (dist/) into a real browser, serves a page that streams media only through scripts,
// then checks detection and real downloads on disk. Run `npm run build` first.
import { chromium } from "@playwright/test";
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const dist = resolve("dist");
const out = resolve("test-results/real-downloads");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const sample = readFileSync("demo/media/sample.mp4");
const seg = (n) => { const b = Buffer.alloc(1880, 0xaa); for (let p = 0; p < 10; p++) { b[p * 188] = 0x47; b[p * 188 + 1] = n; b[p * 188 + 2] = p; } return b; };
const playlist = (extra = "") => ["#EXTM3U", "#EXT-X-VERSION:3", "#EXT-X-TARGETDURATION:2", extra, ...[0, 1, 2].flatMap((i) => ["#EXTINF:2.0,", `/api/hls/seg-${i}.ts`]), "#EXT-X-ENDLIST", ""].filter((l) => l !== "").join("\n") + "\n";

const server = createServer((req, res) => {
  const p = req.url.split("?")[0];
  const send = (t, b, s = 200) => res.writeHead(s, { "content-type": t, "cache-control": "no-store" }).end(b);
  if (p === "/") return send("text/html", `<!doctype html><title>Real streaming test</title><h1>Script-loaded media</h1><video id=v controls muted></video>
<script>fetch("/api/video/1").then(r=>r.arrayBuffer());fetch("/api/hls/vod").then(r=>r.text());fetch("/api/hls/enc").then(r=>r.text());</script>`);
  if (p === "/api/video/1") return send("video/mp4", sample);
  if (p === "/api/hls/vod") return send("application/vnd.apple.mpegurl", playlist());
  if (p === "/api/hls/enc") return send("application/vnd.apple.mpegurl", playlist('#EXT-X-KEY:METHOD=AES-128,URI="https://k.example/k"'));
  const m = /^\/api\/hls\/seg-(\d)\.ts$/.exec(p);
  if (m) return send("video/mp2t", seg(Number(m[1])));
  send("text/plain", "nope", 404);
});
await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
const origin = `http://127.0.0.1:${server.address().port}`;

const results = [];
const check = (name, ok, detail = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  -  " + detail : ""}`); };

// A brand-new profile can hang the first launch on some machines, so one profile is reused and results are matched by this run's address.
const profile = resolve("test-results/profile");
const ctx = await chromium.launchPersistentContext(profile, {
  channel: process.env.CH || "msedge", headless: false, acceptDownloads: true, downloadsPath: out,
  args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
});
const guard = setTimeout(() => { console.log("TIMEOUT"); process.exit(2); }, 120000);
try {
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent("serviceworker");
  const id = new URL(sw.url()).host;
  check("extension loaded in a real browser", true, id);

  const page = await ctx.newPage();
  await page.goto(origin);
  const ext = await ctx.newPage();
  await ext.goto(`chrome-extension://${id}/src/ui/options/index.html`);

  const readScan = () => ext.evaluate(async () => {
    const d = await chrome.storage.session.get(null);
    const all = Object.values(d).flatMap((v) => Object.values(v ?? {}));
    return all.flatMap((s) => s.sources ?? []).map((s) => ({ url: s.url, kind: s.kind, encrypted: s.encrypted }));
  });
  let found = [];
  for (let i = 0; i < 40; i++) { found = await readScan(); if (found.length >= 3) break; await new Promise((r) => setTimeout(r, 500)); }
  check("finds script-loaded media with no file extension", found.some((s) => s.url.endsWith("/api/video/1")) && found.some((s) => s.url.endsWith("/api/hls/vod")), found.map((s) => s.url.replace(origin, "") + ":" + s.kind + (s.encrypted ? ":locked" : "")).join(", "));
  check("encrypted playlist is flagged locked", found.some((s) => s.url.endsWith("/enc") && s.encrypted));

  const start = (url, name) => ext.evaluate(([u, n]) => chrome.runtime.sendMessage({ type: "START_DOWNLOAD", url: u, filename: n, title: "t", quality: "src" }), [url, name]);
  const waitDownload = (match) => ext.evaluate(async (needle) => {
    for (let i = 0; i < 120; i++) {
      const items = await chrome.downloads.search({});
      const it = items.find((d) => d.url.includes(needle));
      if (it && (it.state === "complete" || it.state === "interrupted")) return { state: it.state, filename: it.filename, size: it.fileSize, error: it.error };
      await new Promise((r) => setTimeout(r, 250));
    }
    return null;
  }, match);

  await new Promise((r) => setTimeout(r, 100));
  const mp4 = await start(`${origin}/api/video/1`, "real-direct.mp4");
  const mp4Done = mp4.ok ? await waitDownload("/api/video/1") : null;
  // The test browser stores downloads under random names, so files are matched by source address and read back.
  check("direct video downloads to disk", mp4Done?.state === "complete" && mp4Done.size === sample.length && existsSync(mp4Done.filename), JSON.stringify(mp4Done));

  const hls = await start(`${origin}/api/hls/vod`, "real-hls.mp4");
  check("HLS download starts", hls.ok === true, JSON.stringify(hls));
  const hlsDone = hls.ok ? await waitDownload("blob:" + origin) : null;
  const bytes = hlsDone && existsSync(hlsDone.filename) ? readFileSync(hlsDone.filename) : null;
  check("HLS saved as ONE joined file, segments in order", !!bytes && bytes.length === 5640 && [0, 1, 2].every((n) => bytes[n * 1880 + 1] === n), hlsDone ? `${hlsDone.filename} (${bytes?.length} bytes)` : "no download");

  const enc = await start(`${origin}/api/hls/enc`, "real-enc.mp4");
  check("encrypted stream is refused", enc.ok === false, enc.error ?? "");

  const evil = await start("https://evil.example.net/steal.mp4", "x.mp4");
  check("undetected URL is refused", evil.ok === false, evil.error ?? "");

  if (process.env.DEBUG) console.log("DOWNLOADS:", JSON.stringify(await ext.evaluate(async () => (await chrome.downloads.search({})).map((d) => ({ f: d.filename, u: d.url.slice(0, 60), s: d.state, e: d.error, size: d.fileSize })))));
  const jobs = await ext.evaluate(() => chrome.runtime.sendMessage({ type: "GET_QUEUE" }));
  const mine = jobs.filter((j) => j.url.startsWith(origin));
  check("queue shows both jobs complete", mine.filter((j) => j.state === "complete").length === 2, mine.map((j) => j.state).join(","));
  const hist = await ext.evaluate(() => chrome.runtime.sendMessage({ type: "GET_HISTORY" }));
  check("history recorded", hist.filter((h) => h.ok && h.url.startsWith(origin)).length === 2);
} catch (e) {
  check("script ran without throwing", false, String(e));
} finally {
  clearTimeout(guard);
  await ctx.close();
  server.close();
}
console.log(results.every(Boolean) ? "\nALL REAL-BROWSER CHECKS PASSED" : "\nSOME CHECKS FAILED");
process.exit(results.every(Boolean) ? 0 : 1);

