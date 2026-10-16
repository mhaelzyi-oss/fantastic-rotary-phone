import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(".");
const mark =
  (existsSync(join(root, "public", "icons", "logo.svg")) && join(root, "public", "icons", "logo.svg")) ||
  join(root, "branding", "krypton-ultimate-inc-ii.svg");

try {
  const { default: sharp } = await import("sharp");
  const png = await sharp(readFileSync(mark)).resize(220, 220).png().toBuffer();
  const tile = await sharp({
    create: { width: 1200, height: 630, channels: 3, background: { r: 247, g: 244, b: 238 } },
  })
    .composite([{ input: png, top: 205, left: 490 }])
    .png()
    .toBuffer();
  await sharp(tile).toFile(join(root, "site-dist", "og.png"));
} catch (err) {
  console.warn("og.png skipped:", err instanceof Error ? err.message : err);
}
