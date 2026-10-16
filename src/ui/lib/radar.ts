import type { MediaItem } from "../../shared/types";
import { streamName } from "./streamName";

/** One detected stream plotted on the radar. x/y are percentages of the radar box. */
export type Blip = {
  id: string;
  index: number;
  /** Degrees clockwise from 12 o'clock. The sweep passes a blip when it reaches this angle. */
  angle: number;
  /** 0 (center) to 1 (outer ring). Higher quality sits closer to the center. */
  radius: number;
  x: number;
  y: number;
  locked: boolean;
  label: string;
};

/** FNV-1a, so the same stream always lands on the same spot between scans. */
export function hash32(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function bestHeight(item: MediaItem): number {
  const heights = item.variants.filter((v) => !v.encrypted).map((v) => v.height ?? 0);
  const fromRes = Number.parseInt(item.resolution?.split("\u00d7")[1] ?? "", 10);
  return Math.max(0, ...heights, Number.isFinite(fromRes) ? fromRes : 0);
}

/**
 * Range rings: 4K nearest the center, unknown quality on the outer ring.
 * The center disc (the count) fills about 15.5% of the box, so every ring sits outside it.
 */
export function radiusForHeight(height: number): number {
  if (height >= 2160) return 0.58;
  if (height >= 1080) return 0.67;
  if (height >= 720) return 0.76;
  if (height >= 480) return 0.85;
  return 0.92;
}

const MIN_GAP = 14;
const RING_OFFSETS = [0, 0.06, -0.06, 0.12, -0.12, 0.18, -0.18] as const;
/** Closest a blip may sit to the center (fraction of the 46% usable radius), clear of the count disc. */
export const MIN_RADIUS = 0.52;
export const MAX_RADIUS = 0.94;

function clamp(radius: number): number {
  return Math.min(MAX_RADIUS, Math.max(MIN_RADIUS, radius));
}

function place(angle: number, radius: number): { x: number; y: number } {
  const rad = (angle * Math.PI) / 180;
  return { x: 50 + radius * 46 * Math.sin(rad), y: 50 - radius * 46 * Math.cos(rad) };
}

/** Deterministic layout with a minimum gap so blips never stack on each other. */
export function layoutBlips(items: MediaItem[]): Blip[] {
  const out: Blip[] = [];
  items.forEach((item, index) => {
    const h = hash32(item.url);
    const angle0 = h % 360;
    const jitter = ((h >>> 9) % 100) / 100 - 0.5;
    const radius0 = clamp(radiusForHeight(bestHeight(item)) + jitter * 0.05);
    const nearest = (p: { x: number; y: number }) =>
      out.reduce((min, b) => Math.min(min, Math.hypot(b.x - p.x, b.y - p.y)), Infinity);

    // Prefer the quality ring, then walk to neighbouring rings, until the spot is clear.
    let chosen = { angle: angle0, radius: radius0, ...place(angle0, radius0), gap: nearest(place(angle0, radius0)) };
    search: for (const offset of RING_OFFSETS) {
      const radius = clamp(radius0 + offset);
      for (let k = 0; k < 16; k += 1) {
        const angle = (angle0 + k * 23) % 360;
        const pos = place(angle, radius);
        const gap = nearest(pos);
        if (gap > chosen.gap) chosen = { angle, radius, ...pos, gap };
        if (gap >= MIN_GAP) {
          chosen = { angle, radius, ...pos, gap };
          break search;
        }
      }
    }
    const { angle, radius, x, y } = chosen;
    out.push({
      id: item.url,
      index,
      angle,
      radius,
      x,
      y,
      locked: item.encrypted,
      label: streamName(item, index),
    });
  });
  return out;
}
