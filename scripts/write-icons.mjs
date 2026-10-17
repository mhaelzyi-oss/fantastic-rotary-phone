// Chrome toolbar icons must be PNG. Idle is outline gold; found is filled gold.
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "public", "icons");
mkdirSync(out, { recursive: true });

const hex = "M48 7 83 27v42L48 89 13 69V27z";
const kay = "m35 27 0 42m0-21 27-21M35 48l29 21";

function tile(inner) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" role="img">
  <title>KUI Video Extractor</title>
  <rect x="4" y="4" width="88" height="88" rx="24" fill="#111821"/>
  ${inner}
</svg>
`;
}

const idle = tile(
  `<g fill="none" stroke="#d4af37" stroke-width="3" stroke-linejoin="round">
    <path d="${hex}"/>
    <path d="${kay}" stroke="#ffd966" stroke-width="6"/>
  </g>`,
);
const found = tile(
  `<path d="${hex}" fill="#c9a227"/>
  <path d="${kay}" fill="none" stroke="#1c1404" stroke-width="6" stroke-linejoin="round"/>`,
);

writeFileSync(join(out, "logo.svg"), idle);
writeFileSync(join(out, "logo-idle.svg"), idle);
writeFileSync(join(out, "logo-found.svg"), found);

function crc32(buf) {
  let c = ~0 >>> 0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (~c) >>> 0;
}

function pngFromRgba(width, height, rgba) {
  const stride = width * 4 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    rgba.copy(raw, y * stride + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const t = Buffer.from(type);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
    return Buffer.concat([len, t, data, crc]);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function distSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function inside(px, py, poly) {
  let n = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) n++;
  }
  return n % 2 === 1;
}

function raster(size, filled) {
  const rgba = Buffer.alloc(size * size * 4);
  const s = size / 96;
  const hexPts = [
    [48, 7],
    [83, 27],
    [83, 69],
    [48, 89],
    [13, 69],
    [13, 27],
  ].map(([x, y]) => [x * s, y * s]);
  const kSegs = [
    [35, 27, 35, 69],
    [35, 48, 62, 27],
    [35, 48, 64, 69],
  ].map((n) => n.map((v) => v * s));
  const hexW = Math.max(1.1, 1.6 * s);
  const kW = Math.max(1.4, 3 * s);
  const gold = filled ? [0xc9, 0xa2, 0x27] : [0xd4, 0xaf, 0x37];
  const kay = filled ? [0x1c, 0x14, 0x04] : [0xff, 0xd9, 0x66];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      let r = 0x11;
      let g = 0x18;
      let b = 0x21;
      const cx = x + 0.5;
      const cy = y + 0.5;
      if (filled && inside(cx, cy, hexPts)) {
        r = gold[0];
        g = gold[1];
        b = gold[2];
      } else if (!filled) {
        let d = Infinity;
        for (let i = 0; i < hexPts.length; i++) {
          const [ax, ay] = hexPts[i];
          const [bx, by] = hexPts[(i + 1) % hexPts.length];
          d = Math.min(d, distSeg(cx, cy, ax, ay, bx, by));
        }
        if (d <= hexW) {
          r = gold[0];
          g = gold[1];
          b = gold[2];
        }
      }
      let kd = Infinity;
      for (const [ax, ay, bx, by] of kSegs) kd = Math.min(kd, distSeg(cx, cy, ax, ay, bx, by));
      if (kd <= kW) {
        r = kay[0];
        g = kay[1];
        b = kay[2];
      }
      rgba[i] = r;
      rgba[i + 1] = g;
      rgba[i + 2] = b;
      rgba[i + 3] = 255;
    }
  }
  return pngFromRgba(size, size, rgba);
}

async function writePngs() {
  try {
    const { default: sharp } = await import("sharp");
    for (const size of [16, 32, 48, 128]) {
      const density = Math.max(72, size * 6);
      await sharp(Buffer.from(idle), { density }).resize(size, size).png({ compressionLevel: 9 }).toFile(join(out, `logo-idle-${size}.png`));
      await sharp(Buffer.from(found), { density }).resize(size, size).png({ compressionLevel: 9 }).toFile(join(out, `logo-found-${size}.png`));
    }
  } catch {
    for (const size of [16, 32, 48, 128]) {
      writeFileSync(join(out, `logo-idle-${size}.png`), raster(size, false));
      writeFileSync(join(out, `logo-found-${size}.png`), raster(size, true));
    }
  }
}

await writePngs();
