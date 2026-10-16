import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * "Detect any media being streamed in the browser and make it downloadable", end to end in a real browser.
 *
 * The page names no media file in its HTML. A script fetches everything, as streaming sites do. The real hook,
 * content script, background modules and UI run together; only the browser APIs around them are stand-ins.
 * Joined HLS files are read back from the blob the browser was handed, byte for byte.
 */
const HARNESS = "http://127.0.0.1:4178/stream.html";
const SHOTS = resolve("test-results/ui");

test.describe.configure({ mode: "serial" });
test.use({ deviceScaleFactor: 2 });
test.beforeAll(() => mkdirSync(SHOTS, { recursive: true }));

const ui = (page: Page) => page.locator("#ui");

async function load(page: Page, query = "") {
  await page.setViewportSize({ width: 1100, height: 1150 });
  await page.goto(`${HARNESS}${query}`);
}

/** Click radar blips until the one whose address ends with `suffix` is open. */
async function openStream(page: Page, suffix: string) {
  const blips = page.getByTestId("radar-blip");
  for (let i = 0; i < (await blips.count()); i++) {
    await blips.nth(i).click();
    const url = await ui(page).locator("dl dt:text-is('URL') + dd").innerText();
    if (url.endsWith(suffix)) return;
  }
  throw new Error(`No stream ends with ${suffix}`);
}

/** The list shows four rows at a time. Scroll it until the row for `suffix` is on screen. */
async function rowFor(page: Page, suffix: string) {
  const row = ui(page).locator(`[aria-expanded]:has([title$="${suffix}"])`);
  const host = ui(page).getByTestId("stream-list").locator("> div").first();
  for (let top = 0; top < 600; top += 71) {
    await host.evaluate((el, y) => (el.scrollTop = y), top);
    if (await row.count()) return row;
  }
  throw new Error(`No row ends with ${suffix}`);
}

const download = (page: Page) => ui(page).getByRole("button", { name: "Download", exact: true }).last();
test("finds media that only scripts load, with no file extension in the address", async ({ page }) => {
  await load(page);
  // Direct video (fetch), two playlists (fetch + XHR), plus the encrypted and broken ones.
  await expect(page.getByTestId("radar-blip")).toHaveCount(5, { timeout: 15_000 });
  const titles = await ui(page).locator("[aria-expanded] [title]").evaluateAll((els) => els.map((e) => e.getAttribute("title")));
  expect(titles.join("\n")).toMatch(/\/api\/video\/1/);
  expect(titles.join("\n")).toMatch(/\/api\/hls\/vod/);
  expect(titles.join("\n")).toMatch(/\/api\/hls\/live/);
  await ui(page).screenshot({ path: join(SHOTS, "stream-detected.png") });
});

test("the encrypted playlist is found but locked, and cannot be downloaded", async ({ page }) => {
  await load(page);
  await expect(page.getByTestId("radar-blip")).toHaveCount(5, { timeout: 15_000 });
  await expect(page.locator('[data-testid="radar-blip"][data-locked="true"]')).toHaveCount(1);
  await ui(page).getByLabel("Select all").check();
  await ui(page).getByRole("button", { name: /Download selected/ }).click();
  await expect.poll(() => page.evaluate(() => window.__downloads.length)).toBeGreaterThan(0);
  const sent = await page.evaluate(() => window.__downloads.map((d) => d.url));
  expect(sent.join("\n")).not.toMatch(/\/enc/);
});

test("a script-loaded video file is handed to the browser as is", async ({ page }) => {
  await load(page);
  await expect(page.getByTestId("radar-blip")).toHaveCount(5, { timeout: 15_000 });
  await openStream(page, "/api/video/1");
  await download(page).click();
  await expect.poll(() => page.evaluate(() => window.__saved.length)).toBe(0);
  await expect.poll(() => page.evaluate(() => window.__downloads.map((d) => d.url))).toEqual([expect.stringMatching(/\/api\/video\/1$/)]);
});

test("an HLS stream is fetched by the page, joined in order, and saved as one file", async ({ page }) => {
  await load(page);
  await expect(page.getByTestId("radar-blip")).toHaveCount(5, { timeout: 15_000 });
  await openStream(page, "/api/hls/vod");
  await download(page).click();

  await expect.poll(() => page.evaluate(() => window.__saved.length), { timeout: 15_000 }).toBe(1);
  const [saved] = await page.evaluate(() => window.__saved);
  // The playlist text was NOT saved as a video: the file is the three joined segments.
  expect(saved!.size).toBe(3 * 188 * 10);
  expect(saved!.filename).toMatch(/\.ts$/);
  expect(saved!.filename).toMatch(/^KUIVideoExtractor\//);
  // First packet of the first segment: sync byte, segment 0, packet 0.
  expect(saved!.head.slice(0, 3)).toEqual([0x47, 0, 0]);

  // Order check: the first packet of each segment, read from the blob itself.
  const order = await page.evaluate(async () => {
    const res = await fetch(window.__saved[0]!.url).catch(() => null);
    if (!res) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    return [0, 1, 2].map((n) => bytes[n * 1880 + 1]);
  });
  // The page revokes the blob only after fifteen minutes, so it is still readable here.
  expect(order).toEqual([0, 1, 2]);

  await expect(page.getByText(/1 saved/)).toBeVisible({ timeout: 5000 });
  await page.getByRole("tab", { name: /History/ }).click();
  await expect(page.getByText(/\.ts/).first()).toBeVisible();
});

test("a live stream is refused with a clear reason and nothing is saved", async ({ page }) => {
  await load(page);
  await expect(page.getByTestId("radar-blip")).toHaveCount(5, { timeout: 15_000 });
  await openStream(page, "/api/hls/live");
  await download(page).click();
  await expect(page.getByRole("status").filter({ hasText: /live/i }).first()).toBeVisible({ timeout: 10_000 });
  expect(await page.evaluate(() => window.__saved.length)).toBe(0);
  expect(await page.evaluate(() => window.__downloads.length)).toBe(0);
  // A permanent refusal is not retried.
  expect(await page.evaluate(() => window.__alarms.length)).toBe(0);
});

test("a stream whose segments cannot be fetched fails cleanly", async ({ page }) => {
  await load(page);
  await expect(page.getByTestId("radar-blip")).toHaveCount(5, { timeout: 15_000 });
  await openStream(page, "/api/hls/broken");
  await download(page).click();
  await expect.poll(() => page.evaluate(() => window.__alarms.length), { timeout: 20_000 }).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.__saved.length)).toBe(0);
  await ui(page).screenshot({ path: join(SHOTS, "stream-failed.png") });
});

test("when the browser will not take the blob, the page clicks a download link instead", async ({ page }) => {
  await load(page);
  await expect(page.getByTestId("radar-blip")).toHaveCount(5, { timeout: 15_000 });
  await page.evaluate(() => {
    window.__refuseBlobDownload = true;
  });
  const saved = page.waitForEvent("download", { timeout: 15_000 });
  await openStream(page, "/api/hls/vod");
  await download(page).click();
  const file = await saved;
  expect(file.suggestedFilename()).toMatch(/\.ts$/);
  const path = await file.path();
  expect(path).toBeTruthy();
});

test("a blob-fed player (no file address exists) offers a yt-dlp page command", async ({ page }) => {
  await load(page, "?case=blob");
  const fallback = page.getByTestId("page-fallback");
  await expect(fallback).toBeVisible({ timeout: 15_000 });
  await expect(fallback).toContainText("yt-dlp");
  await expect(fallback).toContainText("stream.html");
  await ui(page).screenshot({ path: join(SHOTS, "stream-blob.png") });
});

test("saving to the library and downloading from it", async ({ page }) => {
  await load(page);
  await expect(page.getByTestId("radar-blip")).toHaveCount(5, { timeout: 15_000 });
  const row = await rowFor(page, "/api/video/1");
  await row.locator("xpath=..").getByRole("button", { name: "Save to library" }).click();
  await page.getByRole("tab", { name: /Saved/ }).click();
  await expect(ui(page).getByRole("list").getByText(/cdn|127\.0\.0\.1/).first()).toBeVisible();
  await ui(page).getByRole("button", { name: "Download", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__downloads.length)).toBe(1);
});
