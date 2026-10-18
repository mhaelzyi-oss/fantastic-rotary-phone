import { expect, test, type Page } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";

/**
 * Runs the BUILT bundle (`dist/`, what Chrome actually loads) in a real browser: bundled CSS, hashed
 * assets, bundled font. Only `chrome.runtime` is stubbed, because ordinary pages do not have it.
 * Run `npm run build` first.
 */
const DIST = resolve("dist");
const TYPES: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".woff2": "font/woff2",
  ".png": "image/png",
  ".json": "application/json",
};

let server: Server;
let origin = "";

test.beforeAll(async () => {
  test.skip(!existsSync(join(DIST, "manifest.json")), "run `npm run build` first");
  server = createServer((req, res) => {
    const path = normalize(decodeURIComponent((req.url ?? "/").split("?")[0]!)).replace(/^[/\\]+/, "");
    const file = join(DIST, path);
    if (!file.startsWith(DIST) || !existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" }).end(readFileSync(file));
  });
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  const addr = server.address();
  origin = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
});

test.afterAll(() => new Promise<void>((ok) => server?.close(() => ok())));

function stubChrome() {
  const mk = (url: string, height: number, encrypted = false) => ({
    url,
    kind: url.endsWith(".m3u8") ? "hls" : "progressive",
    originHost: "cdn.example.com",
    title: "Fixture",
    pageUrl: "https://example.com/watch",
    source: "dom",
    encrypted,
    variants: [{ url, label: `${height}p`, height, encrypted, kind: url.endsWith(".m3u8") ? "hls" : "progressive" }],
    subtitles: [],
  });
  const scan = {
    pageUrl: "https://example.com/watch",
    pageTitle: "Fixture",
    sources: [
      mk("https://cdn.example.com/a-1080p.mp4", 1080),
      mk("https://cdn.example.com/b-720p.mp4", 720),
      mk("https://cdn.example.com/live/master.m3u8", 1080),
      mk("https://cdn.example.com/drm.m3u8", 1080, true),
    ],
  };
  (window as unknown as { chrome: unknown }).chrome = {
    runtime: {
      sendMessage: async (m: { type: string }) => {
        if (m.type === "GET_SCAN") return scan;
        if (m.type === "GET_HISTORY" || m.type === "GET_QUEUE") return [];
        return undefined;
      },
      onMessage: { addListener() {}, removeListener() {} },
    },
  };
}

async function open(page: Page, path: string) {
  const outside: string[] = [];
  const problems: string[] = [];
  page.on("request", (r) => {
    if (!r.url().startsWith(origin) && !r.url().startsWith("data:")) outside.push(r.url());
  });
  page.on("pageerror", (e) => problems.push(e.message));
  // Report what failed by URL. A plain page auto-requests /favicon.ico (an extension popup does not), and the
  // detail panel's <video> preview points at the stream host, which is the fixture's fake CDN.
  page.on("response", (r) => {
    if (r.status() >= 400 && !r.url().endsWith("/favicon.ico")) problems.push(`${r.status()} ${r.url()}`);
  });
  page.on("console", (m) => {
    if (m.type() === "error" && !/Failed to load resource|frame-ancestors/.test(m.text())) problems.push(m.text());
  });
  await page.addInitScript(stubChrome);
  await page.goto(`${origin}/${path}`);
  return { outside, problems };
}

test("built popup renders the radar, rows, bundled font and glass, with no outside requests", async ({ page }) => {
  const seen = await open(page, "src/ui/popup/index.html");
  await expect(page.getByTestId("radar-blip")).toHaveCount(4);
  await expect(page.locator('[data-testid="radar-blip"][data-locked="true"]')).toHaveCount(1);
  await expect(page.getByText("4 streams", { exact: true })).toBeVisible();
  await expect(page.getByText("a-1080p.mp4")).toBeVisible();

  const font = await page.evaluate(async () => {
    await document.fonts.ready;
    return { family: getComputedStyle(document.body).fontFamily, ok: document.fonts.check("14px 'Instrument Sans Variable'") };
  });
  expect(font.family).toContain("Instrument Sans");
  expect(font.ok).toBe(true);
  expect(await page.evaluate(() => getComputedStyle(document.querySelector("section")!).backdropFilter)).toMatch(/blur/);

  // Popup width contract: Chrome sizes the popup from the document.
  const width = await page.evaluate(() => document.documentElement.getBoundingClientRect().width);
  expect(width).toBe(400);

  expect(seen.outside).toEqual([]);
  expect(seen.problems).toEqual([]);
});

test("built popup opens a command for a public stream and none for a locked one", async ({ page }) => {
  const seen = await open(page, "src/ui/popup/index.html");
  await expect(page.getByTestId("radar-blip")).toHaveCount(4);
  await page.getByRole("button", { name: "Show command" }).first().click();
  await expect(page.getByTestId("command-output")).toContainText("yt-dlp");
  await page.getByTestId("radar-blip").nth(3).click();
  await expect(page.getByTestId("command-refused")).toContainText(/DRM/);
  expect(seen.problems).toEqual([]);
});

test("built side panel and options pages load cleanly", async ({ page }) => {
  const panel = await open(page, "src/ui/sidepanel/index.html");
  await expect(page.getByTestId("radar-blip")).toHaveCount(4);
  expect(panel.problems).toEqual([]);
  expect(panel.outside).toEqual([]);

  const options = await page.context().newPage();
  const seen = await open(options, "src/ui/options/index.html");
  await expect(options.getByRole("heading", { name: "KUI Video Extractor" })).toBeVisible();
  await expect(options.getByLabel("Default tool")).toBeVisible();
  expect(seen.problems).toEqual([]);
  expect(seen.outside).toEqual([]);
});

test("built extension ships the seven local-file tool pages", async ({ page }) => {
  const slugs = ["convert", "compress", "trim", "merge", "gif", "audio", "add-audio"];
  for (const slug of slugs) {
    expect(existsSync(join(DIST, "tools", slug, "index.html")), slug).toBe(true);
    expect(existsSync(join(DIST, "tools", slug, "app.js")), slug).toBe(true);
  }
  const seen = await open(page, "tools/convert/index.html");
  await expect(page.getByRole("heading", { name: "Video Converter" })).toBeVisible();
  await expect(page.getByText("KUI Video Extractor").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Convert" })).toBeHidden();
  await expect(page.getByRole("button", { name: /Drop your video/ })).toBeVisible();
  expect(seen.outside).toEqual([]);
  expect(seen.problems).toEqual([]);
});

test("every file the manifest points at exists in dist", async () => {
  const manifest = JSON.parse(readFileSync(join(DIST, "manifest.json"), "utf8")) as Record<string, any>;
  const refs = [
    manifest.options_page,
    manifest.side_panel?.default_path,
    manifest.action?.default_popup,
    manifest.background?.service_worker,
    ...Object.values<string>(manifest.icons ?? {}),
    ...Object.values<string>(manifest.action?.default_icon ?? {}),
    ...(manifest.content_scripts ?? []).flatMap((c: { js: string[] }) => c.js),
    ...(manifest.web_accessible_resources ?? []).flatMap((w: { resources: string[] }) => w.resources),
  ].filter(Boolean) as string[];
  expect(refs.length).toBeGreaterThan(8);
  for (const ref of refs) expect(existsSync(join(DIST, ref)), ref).toBe(true);
});

test("the page-world hook is one self-contained script with the right permissions, and the manifest is clean text", async () => {
  const raw = readFileSync(join(DIST, "manifest.json"), "utf8");
  const manifest = JSON.parse(raw) as Record<string, any>;
  // No garbled characters in what Chrome shows on the extensions page.
  expect(manifest.description).not.toMatch(/[\u00C2\u00C3\u00E2\uFFFD]/);
  const hook = (manifest.content_scripts as { world?: string; js: string[]; run_at: string }[]).find((c) => c.world === "MAIN");
  expect(hook, "a MAIN world content script").toBeDefined();
  expect(hook!.run_at).toBe("document_start");
  const code = readFileSync(join(DIST, hook!.js[0]!), "utf8");
  // A page-world script has no chrome.runtime and cannot load extension chunks.
  expect(code).not.toMatch(/chrome\.runtime|\bimport\s*\(|^import\s/m);
  expect(code).toContain("vpf-hook");
  expect(manifest.permissions).toEqual(expect.arrayContaining(["downloads", "alarms", "storage", "activeTab"]));
  // Nothing in the manifest asks for more reach than it uses.
  expect(manifest.host_permissions ?? []).toEqual([]);
});
