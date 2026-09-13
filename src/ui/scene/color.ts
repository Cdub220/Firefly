/**
 * Temperature to color, no three.js so it is testable. Ambient slate, through amber, to
 * red at 400 C, white-hot at and above 600 C. Same ramp the split view describes in words.
 */
export type Rgb = [number, number, number];

export const SLATE: Rgb = [0x47, 0x55, 0x69];
export const AMBER: Rgb = [0xf5, 0x9e, 0x0b];
export const RED: Rgb = [0xef, 0x44, 0x44];
export const WHITE_HOT: Rgb = [0xff, 0xf1, 0xe6];

export const AMBER_AT_C = 200;
export const RED_AT_C = 400;
export const WHITE_AT_C = 600;

const lerp = (a: Rgb, b: Rgb, t: number): Rgb => [
  Math.round(a[0] + (b[0] - a[0]) * t),
  Math.round(a[1] + (b[1] - a[1]) * t),
  Math.round(a[2] + (b[2] - a[2]) * t),
];
const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

export function tempRgb(temp: number, ambient: number): Rgb {
  if (!Number.isFinite(temp) || temp <= ambient) return SLATE;
  if (temp < AMBER_AT_C) return lerp(SLATE, AMBER, clamp01((temp - ambient) / Math.max(1, AMBER_AT_C - ambient)));
  if (temp < RED_AT_C) return lerp(AMBER, RED, clamp01((temp - AMBER_AT_C) / (RED_AT_C - AMBER_AT_C)));
  if (temp < WHITE_AT_C) return lerp(RED, WHITE_HOT, clamp01((temp - RED_AT_C) / (WHITE_AT_C - RED_AT_C)));
  return WHITE_HOT;
}

export function tempHex(temp: number, ambient: number): string {
  const [r, g, b] = tempRgb(temp, ambient);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

export const EDGE_COLORS = {
  door: '#9ca3af',
  passage: '#9ca3af',
  bulkhead: '#374151',
  floor: '#60a5fa',
  shaft: '#3b82f6',
  closed: '#7f1d1d',
} as const;

export const SENSOR_COLORS = { ok: '#22c55e', dead: '#ef4444', lying: '#f59e0b' } as const;
