import { expect, test, type Page } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

/**
 * Real browser, real UI, real content-script scanner. The harness page holds the fixture DOM, runs the
 * actual `src/content` scanner on it, and renders the actual `FinderApp`. Only the service worker is a mock.
 * The command checks go one step further and run the command shown in the UI through a real shell.
 */
const HARNESS = "http://127.0.0.1:4178/";
const SHOTS = resolve("test-results/ui");
const SAMPLE_FILE = resolve("demo/media/sample.mp4");

test.describe.configure({ mode: "serial" });
test.use({ deviceScaleFactor: 2 });
test.beforeAll(() => mkdirSync(SHOTS, { recursive: true }));

async function load(page: Page, query = "") {
  await page.setViewportSize({ width: 1100, height: 1150 });
  await page.goto(`${HARNESS}${query}`);
  await expect(page.getByTestId("radar-blip")).toHaveCount(8, { timeout: 15_000 });
}

const ui = (page: Page) => page.locator("#ui");

/** Click every blip once and map stream URL -> blip index. */
async function mapBlips(page: Page): Promise<Record<string, number>> {
  const blips = page.getByTestId("radar-blip");
  const map: Record<string, number> = {};
  for (let i = 0; i < (await blips.count()); i++) {
    await blips.nth(i).click();
    // The click must land on exactly this blip (not on a neighbour's ring).
    await expect(blips.nth(i)).toHaveAttribute("data-selected", "true");
    map[await ui(page).locator("dl dt:text-is('URL') + dd").innerText()] = i;
  }
  return map;
}

test("the radar plots every stream on the page and locks the protected ones", async ({ page }) => {
  await load(page);
  await expect(page.getByTestId("radar")).toHaveAttribute("data-state", "found");
  await expect(page.locator('[data-testid="radar-blip"][data-locked="true"]')).toHaveCount(2);
  await expect(page.getByText("Live", { exact: true })).toBeVisible();
  await expect(page.getByText("8 streams", { exact: true })).toBeVisible();
  // The streams are visible without scrolling the popup: the first row sits inside its 600px cap.
  const firstRow = await ui(page).locator("[aria-expanded]").first().boundingBox();
  const frame = await ui(page).locator("> div").first().boundingBox();
  expect(firstRow!.y + firstRow!.height).toBeLessThanOrEqual(frame!.y + 600);
  await ui(page).screenshot({ path: join(SHOTS, "radar-light.png") });
});

test("blips keep their positions across rescans", async ({ page }) => {
  await load(page);
  const before = await page.getByTestId("radar-blip").evaluateAll((els) => els.map((e) => e.getAttribute("style")));
  await page.getByRole("button", { name: "Rescan" }).click();
  await expect(page.getByTestId("radar-blip")).toHaveCount(8);
  const after = await page.getByTestId("radar-blip").evaluateAll((els) => els.map((e) => e.getAttribute("style")));
  expect([...after].sort()).toEqual([...before].sort());
});

test("follows the vidow look: Instrument Sans, blue accent, 16px glass cards", async ({ page }) => {
  await load(page);
  expect(await page.evaluate(() => getComputedStyle(document.body).fontFamily)).toContain("Instrument Sans");
  expect(
    await page.evaluate(async () => {
      await document.fonts.ready;
      return document.fonts.check("14px 'Instrument Sans Variable'");
    }),
  ).toBe(true);
  const card = await page.locator("section[aria-label='Download radar']").evaluate((el) => {
    const s = getComputedStyle(el);
    return { radius: s.borderRadius, filter: s.backdropFilter || s.webkitBackdropFilter, shadow: s.boxShadow };
  });
  expect(card.radius).toBe("16px");
  expect(card.filter).toMatch(/blur\(24px\).*saturate\(1\.8\)|saturate\(180%\)/);
  expect(card.shadow).not.toBe("none");
  expect(await page.getByText("Live", { exact: true }).evaluate((el) => getComputedStyle(el).color)).toBe("rgb(201, 162, 39)");
  const row = await page.locator("[aria-expanded]").first().evaluate((el) => getComputedStyle(el.closest("div")!).borderRadius);
  expect(row).toBe("12px");
});

test("fits a 400px popup without horizontal scrolling", async ({ page }) => {
  await load(page);
  const overflow = await ui(page).evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("every tool offers the right commands per stream type, and DRM streams get none", async ({ page }) => {
  await load(page);
  const map = await mapBlips(page);
  const find = (re: RegExp) => Object.entries(map).find(([url]) => re.test(url));
  // The detail panel shows the selected variant, so a clear HLS stream appears under its 1080p variant URL.
  // Protected streams have no selectable variant (all encrypted), so they show their own URL.
  const hls = find(/\/hls\/1080\/index\.m3u8$/);
  const drmHls = find(/\/media\/protected\.m3u8$/);
  const drmDash = find(/\/media\/protected\.mpd$/);
  const mp4 = find(/\/media\/sample\.mp4$/);
  expect(hls && drmHls && drmDash && mp4, JSON.stringify(Object.keys(map))).toBeTruthy();

  const tool = (name: string) => page.getByRole("tablist", { name: "Tool" }).getByRole("tab", { name });
  const shell = (name: string) => page.getByRole("tablist", { name: "Shell" }).getByRole("tab", { name });
  const out = page.getByTestId("command-output");

  await page.getByTestId("radar-blip").nth(hls![1]).click();
  await shell("bash / zsh").click();
  for (const name of ["curl", "wget", "aria2"]) await expect(tool(name)).toBeDisabled();
  for (const [name, expected] of [
    ["yt-dlp", /^yt-dlp .*--merge-output-format mp4/],
    ["ffmpeg", /^ffmpeg -hide_banner .*-i \S*\/hls\/1080\/index\.m3u8 -c copy -bsf:a aac_adtstoasc /],
    ["streamlink", /^streamlink .*hls:\/\/\S*\/hls\/1080\/index\.m3u8 best$/],
    ["N_m3u8DL-RE", /^N_m3u8DL-RE \S*\/hls\/1080\/index\.m3u8 .*--auto-select/],
  ] as const) {
    await tool(name).click();
    await expect(out).toHaveText(expected);
  }
  await page.getByTestId("command-output").scrollIntoViewIfNeeded();
  await ui(page).screenshot({ path: join(SHOTS, "command-hls.png") });

  await page.getByTestId("radar-blip").nth(mp4![1]).click();
  await expect(tool("streamlink")).toBeDisabled();
  await expect(tool("N_m3u8DL-RE")).toBeDisabled();
  await shell("PowerShell").click();
  await tool("curl").click();
  await expect(out).toHaveText(/^curl\.exe -L --fail --retry 3 /);
  await tool("wget").click();
  await expect(out).toHaveText(/^wget\.exe -c /);
  await shell("cmd.exe").click();
  await tool("aria2").click();
  await expect(out).toHaveText(/^aria2c -x 16 -s 16 -k 1M /);
  await shell("bash / zsh").click();
  await expect(out).toHaveText(/^aria2c -x 16 -s 16 -k 1M /);

  for (const drm of [drmHls!, drmDash!]) {
    await page.getByTestId("radar-blip").nth(drm[1]).click();
    await expect(page.getByTestId("command-output")).toHaveCount(0);
    await expect(page.getByTestId("command-refused")).toContainText(/DRM|protected|encrypted/i);
    await expect(page.getByRole("button", { name: /Copy as script|Copy \.bat/ })).toHaveCount(0);
    await expect(ui(page).getByRole("button", { name: "Download", exact: true }).last()).toBeDisabled();
  }
  await page.getByTestId("command-refused").scrollIntoViewIfNeeded();
  await ui(page).screenshot({ path: join(SHOTS, "command-drm-locked.png") });
});

test("the command shown for a public file really downloads it through PowerShell", async ({ page }) => {
  test.skip(process.platform !== "win32", "PowerShell run is Windows-only here; bash is covered by unit tests");
  await load(page);
  const map = await mapBlips(page);
  const sample = Object.entries(map).find(([url]) => /\/media\/sample\.mp4$/.test(url));
  await page.getByTestId("radar-blip").nth(sample![1]).click();
  await page.getByRole("tablist", { name: "Shell" }).getByRole("tab", { name: "PowerShell" }).click();
  await page.getByRole("tablist", { name: "Tool" }).getByRole("tab", { name: "curl" }).click();
  const command = (await page.getByTestId("command-output").innerText()).trim();
  expect(command).toMatch(/^curl\.exe /);

  const work = mkdtempSync(join(tmpdir(), "gws-run-"));
  try {
    const r = spawnSync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(command, "utf16le").toString("base64")],
      { cwd: work, encoding: "utf8", timeout: 60_000 },
    );
    expect(r.status, r.stderr || r.stdout).toBe(0);
    const files = readdirSync(work);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/\.mp4$/);
    expect(readFileSync(join(work, files[0]!)).equals(readFileSync(SAMPLE_FILE))).toBe(true);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});

test("a selected batch becomes one script and one URL list, without protected streams", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: "http://127.0.0.1:4178" });
  await load(page);
  await ui(page).getByLabel("Select all").check();
  await expect(page.getByTestId("batch-bar")).toBeVisible();

  await page.getByRole("button", { name: "Copy URL list" }).click();
  const urls = (await page.evaluate(() => navigator.clipboard.readText())).trim().split("\n");
  expect(urls).toHaveLength(6);
  expect(urls.join("\n")).not.toMatch(/protected/);
  expect(new Set(urls).size).toBe(6);

  await page.getByRole("button", { name: /Copy script \(6\)/ }).click();
  const script = await page.evaluate(() => navigator.clipboard.readText());
  expect(script).toMatch(/KUI Video Extractor by Krypton Ultimate Inc II/);
  expect(script).not.toMatch(/protected/);
  const commandLines = script.split(/\r?\n/).filter((l) => l && !l.startsWith("#") && !l.startsWith("$ErrorAction") && !l.startsWith("@echo") && !/^(REM|chcp|set -u)/.test(l));
  expect(commandLines).toHaveLength(6);
  await ui(page).screenshot({ path: join(SHOTS, "batch.png") });
});

test("downloading a public file hands the right file name and URL to the worker", async ({ page }) => {
  await load(page);
  const map = await mapBlips(page);
  const sample = Object.entries(map).find(([url]) => /\/media\/sample\.mp4$/.test(url));
  await page.getByTestId("radar-blip").nth(sample![1]).click();
  await ui(page).getByRole("button", { name: "Download", exact: true }).last().click();
  await expect(page.getByRole("progressbar")).toBeVisible();
  const downloads = await page.evaluate(() => window.__downloads);
  expect(downloads).toHaveLength(1);
  expect(downloads[0]!.url).toMatch(/\/media\/sample\.mp4$/);
  expect(downloads[0]!.filename).toMatch(/^KUIVideoExtractor\/[\w.-]+\.mp4$/);
  await expect(page.getByText(/1 saved/)).toBeVisible({ timeout: 5000 });
  await ui(page).screenshot({ path: join(SHOTS, "download-progress.png") });
  await page.getByRole("tab", { name: /History/ }).click();
  await expect(page.getByText(/Saved ·/)).toBeVisible();
  await ui(page).screenshot({ path: join(SHOTS, "history.png") });
});

test("protected streams cannot be selected or downloaded from the list", async ({ page }) => {
  await load(page);
  await ui(page).getByLabel("Select all").check();
  await ui(page).getByRole("button", { name: /Download selected/ }).click();
  // Five direct files go straight to the browser. The one playlist is joined by the page first, so it is not here yet.
  await expect.poll(() => page.evaluate(() => window.__downloads.length)).toBe(5);
  const sent = await page.evaluate(() => window.__downloads.map((d) => d.url));
  expect(sent.join("\n")).not.toMatch(/protected/);
});

test("keyboard users can pick a stream from the radar", async ({ page }) => {
  await load(page);
  await page.getByTestId("radar-blip").first().focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("command-panel")).toBeVisible();
});

test("the system theme follows the OS, and an explicit choice overrides it", async ({ page }) => {
  const radarBg = () => page.locator("section[aria-label='Download radar']").evaluate((el) => getComputedStyle(el).backgroundColor);
  await page.emulateMedia({ colorScheme: "dark" });
  await load(page); // default pref is "system"
  expect(await radarBg()).toMatch(/rgba\(24, 24, 27/);
  await page.emulateMedia({ colorScheme: "light" });
  await load(page, "?theme=dark"); // saved pref wins over the OS
  expect(await radarBg()).toMatch(/rgba\(24, 24, 27/);
  await load(page, "?theme=light");
  expect(await radarBg()).toBe("rgba(255, 255, 255, 0.62)");
});

test("dark theme keeps the glass look", async ({ page }) => {
  await load(page, "?theme=dark");
  const bg = await page.locator("section[aria-label='Download radar']").evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(bg).toMatch(/rgba\(24, 24, 27/);
  expect(await page.evaluate(() => getComputedStyle(document.body).color)).toBe("rgb(250, 250, 250)");
  await ui(page).screenshot({ path: join(SHOTS, "radar-dark.png") });
});

test("reduced motion stops the radar sweep", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await load(page);
  const duration = await page.locator("[data-testid='radar'] > span").nth(5).evaluate((el) => getComputedStyle(el).animationDuration);
  expect(parseFloat(duration)).toBeLessThan(0.01);
});

test("options page saves command-line defaults through the worker", async ({ page }) => {
  await page.setViewportSize({ width: 760, height: 1100 });
  await page.goto(`${HARNESS}options.html`);
  await expect(page.getByRole("heading", { name: "KUI Video Extractor" })).toBeVisible();
  await expect(page.getByLabel("Default tool")).toHaveValue("yt-dlp");
  await page.getByLabel("Default tool").selectOption("aria2c");
  await page.getByLabel("Shell").selectOption("powershell");
  await page.getByLabel(/Send this browser/).check();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();
  const saved = await page.evaluate(() => window.__prefsWrites.at(-1));
  expect(saved).toMatchObject({ cliTool: "aria2c", cliShell: "powershell", cliUserAgent: true, cliReferer: true });
  await page.screenshot({ path: join(SHOTS, "options.png"), fullPage: true });
});

test("side panel layout fills the height", async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 1150 });
  await page.goto(`${HARNESS}?layout=panel`);
  await expect(page.getByTestId("radar-blip")).toHaveCount(8, { timeout: 15_000 });
  await expect(page.getByTestId("radar")).toHaveAttribute("data-state", "found");
  await page.screenshot({ path: join(SHOTS, "panel.png"), fullPage: true });
});
