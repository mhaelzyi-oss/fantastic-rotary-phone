// Chrome toolbar icons must be PNG. Crop the publisher SVG's K monogram; do not add a second mark.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "public", "icons");
mkdirSync(out, { recursive: true });

const mark = readFileSync(join(root, "branding", "krypton-ultimate-inc-ii.svg"), "utf8").replace(
  'viewBox="0 0 480 96"',
  'viewBox="0 0 96 96"',
);

writeFileSync(join(out, "logo.svg"), mark);

for (const size of [16, 32, 48, 128]) {
  const png = await sharp(Buffer.from(mark), { density: Math.max(72, size * 6) })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toBuffer();
  await sharp(png).toFile(join(out, `logo-idle-${size}.png`));
  await sharp(png).toFile(join(out, `logo-found-${size}.png`));
}
