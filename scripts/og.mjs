import sharp from "sharp";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(".");
const icon = readFileSync(join(root, "branding", "icon.svg"));
const png = await sharp(icon).resize(220, 220).png().toBuffer();
const tile = await sharp({
  create: { width: 1200, height: 630, channels: 3, background: { r: 243, g: 246, b: 251 } },
})
  .composite([{ input: png, top: 205, left: 490 }])
  .png()
  .toBuffer();
await sharp(tile).toFile(join(root, "site-dist", "og.png"));
