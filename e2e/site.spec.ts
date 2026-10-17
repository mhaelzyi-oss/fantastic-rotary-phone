import { expect, test } from "@playwright/test";
import { existsSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { readFileSync, statSync } from "node:fs";

const ROOT = resolve("site-dist");
const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml",
  ".zip": "application/zip",
  ".js": "text/javascript; charset=utf-8",
};

let server: Server;
let origin = "";

test.beforeAll(async () => {
  test.skip(!existsSync(join(ROOT, "index.html")), "run `npm run build:site` first");
  server = createServer((req, res) => {
    const raw = decodeURIComponent((req.url ?? "/").split("?")[0]!);
    const path = normalize(raw).replace(/^[/\\]+/, "") || "index.html";
    const file = join(ROOT, path);
    if (!file.startsWith(ROOT) || !existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404, { "content-type": "text/html; charset=utf-8" }).end(readFileSync(join(ROOT, "404.html")));
      return;
    }
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" }).end(readFileSync(file));
  });
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  const addr = server.address();
  origin = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
});

test.afterAll(() => new Promise<void>((ok) => server?.close(() => ok())));

test("the home page has no cookies, no third-party requests, and only first-party pulse.js", async ({ page, context }) => {
  const outside: string[] = [];
  page.on("request", (r) => {
    if (!r.url().startsWith(origin) && !r.url().startsWith("data:")) outside.push(r.url());
  });
  await page.goto(origin + "/");
  await expect(page.getByRole("heading", { name: "Extract the video." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Install" }).first()).toBeVisible();
  expect(await page.locator("script").evaluateAll((nodes) => nodes.map((n) => n.getAttribute("src")))).toEqual(["/studio/pulse.js"]);
  expect(await context.cookies()).toEqual([]);
  expect(outside).toEqual([]);
  await expect(page.getByRole("heading", { name: "Stay in the loop" })).toBeVisible();
});

test("the converter on the site asks for a local file instead of hanging", async ({ page }) => {
  await page.goto(origin + "/tools/convert/index.html");
  await expect(page.getByRole("heading", { name: "Video Converter" })).toBeVisible();
  await page.getByRole("button", { name: "Convert" }).click();
  await expect(page.getByRole("status")).toContainText(/Choose a local file/);
});

test("privacy, security and 404 pages load, and the checksums file is there", async ({ page }) => {
  await page.goto(origin + "/privacy.html");
  await expect(page.getByRole("heading", { name: "Privacy and data retention" })).toBeVisible();
  await expect(page.getByText(/no account/i).first()).toBeVisible();
  await page.goto(origin + "/security.html");
  await expect(page.getByRole("heading", { name: "Security" })).toBeVisible();
  await page.goto(origin + "/no-such-page");
  await expect(page.getByRole("heading", { name: /That page isn.t here/ })).toBeVisible();
  const sums = await page.goto(origin + "/downloads/SHA256SUMS.txt");
  expect(sums?.ok()).toBe(true);
  expect(await sums?.text()).toMatch(/kui-video-extractor-1\.\d+\.\d+\.zip/);
});
