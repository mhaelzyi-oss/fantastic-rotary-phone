import { expect, test } from "@playwright/test";

test("demo page exposes a public video for the scanner", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /KUI Video Extractor/ })).toBeVisible();
  await expect(page.locator("video source")).toHaveAttribute("src", /flower\.mp4/);
  await expect(page.getByRole("link", { name: "Direct MP4" })).toBeVisible();
});
