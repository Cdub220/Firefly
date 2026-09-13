/**
 * Pure 3D layout for a structure plan. Levels stack on y. Within a level, generator-style
 * ids ("L2-B3") land on a grid; anything else gets a deterministic force layout over the
 * level's edges, seeded from the plan name. Spaces joined vertically (floor or shaft
 * edges) share x and z so a column reads as a column.
 *
 * No three.js here: this is testable under plain vitest.
 */
import { makeRng, type Rng } from '../shared/rng';
import type { SpaceId, StructurePlan } from '../shared/types';

export type Pos = { x: number; y: number; z: number };
export type Layout = Record<SpaceId, Pos>;

export const LEVEL_SPACING = 3;
/** Grid pitch. Boxes are 2 wide, so 3.6 leaves a gap the edge lines can be seen in. */
export const CELL_SPACING = 3.6;
/** Same-level spaces never sit closer than this after layout. Boxes are 2 wide. */
export const MIN_SEPARATION = 2.2;
const FORCE_ITERATIONS = 50;
const GRID_ID = /^L(\d+)-([A-Z])(\d+)$/;

function hashName(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

const yOf = (level: number): number => (level - 1) * LEVEL_SPACING;

/** Fruchterman-Reingold on one level, deterministic given the rng. Returns x/z per id. */
function forceLayout(ids: SpaceId[], edges: Array<[SpaceId, SpaceId]>, rng: Rng): Map<SpaceId, { x: number; z: number }> {
  const n = ids.length;
  const pos = new Map<SpaceId, { x: number; z: number }>();
  const radius = Math.max(CELL_SPACING, (CELL_SPACING * n) / (2 * Math.PI));
  ids.forEach((id, i) => {
    const a = (2 * Math.PI * i) / n + rng.range(-0.1, 0.1);
    pos.set(id, { x: radius * Math.cos(a), z: radius * Math.sin(a) });
  });
  if (n <= 1) return pos;
  const k = CELL_SPACING;
  let temperature = CELL_SPACING;
  for (let iter = 0; iter < FORCE_ITERATIONS; iter++) {
    const disp = new Map<SpaceId, { x: number; z: number }>(ids.map((id) => [id, { x: 0, z: 0 }]));
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = pos.get(ids[i]!)!;
        const b = pos.get(ids[j]!)!;
        let dx = a.x - b.x;
        let dz = a.z - b.z;
        let d = Math.hypot(dx, dz);
        if (d < 1e-6) { dx = rng.range(-1, 1); dz = rng.range(-1, 1); d = Math.hypot(dx, dz); }
        const f = (k * k) / d;
        const da = disp.get(ids[i]!)!;
        const db = disp.get(ids[j]!)!;
        da.x += (dx / d) * f; da.z += (dz / d) * f;
        db.x -= (dx / d) * f; db.z -= (dz / d) * f;
      }
    }
    for (const [u, v] of edges) {
      const a = pos.get(u);
      const b = pos.get(v);
      if (!a || !b) continue;
      const dx = a.x - b.x;
      const dz = a.z - b.z;
      const d = Math.hypot(dx, dz);
      if (d < 1e-6) continue;
      const f = (d * d) / k;
      const da = disp.get(u)!;
      const db = disp.get(v)!;
      da.x -= (dx / d) * f; da.z -= (dz / d) * f;
      db.x += (dx / d) * f; db.z += (dz / d) * f;
    }
    for (const id of ids) {
      const p = pos.get(id)!;
      const dsp = disp.get(id)!;
      const len = Math.hypot(dsp.x, dsp.z);
      if (len < 1e-9) continue;
      const step = Math.min(len, temperature);
      p.x += (dsp.x / len) * step;
      p.z += (dsp.z / len) * step;
    }
    temperature *= 0.95;
  }
  return pos;
}

/** Push any two groups that share a level apart until they are MIN_SEPARATION from each other. */
function separate(
  groups: Array<{ members: SpaceId[]; levels: Set<number>; x: number; z: number }>,
  rng: Rng,
): void {
  for (let pass = 0; pass < 40; pass++) {
    let moved = false;
    for (let i = 0; i < groups.length; i++) {
      for (let j = i + 1; j < groups.length; j++) {
        const a = groups[i]!;
        const b = groups[j]!;
        if (![...a.levels].some((l) => b.levels.has(l))) continue;
        let dx = a.x - b.x;
        let dz = a.z - b.z;
        let d = Math.hypot(dx, dz);
        if (d >= MIN_SEPARATION) continue;
        if (d < 1e-6) { dx = rng.range(-1, 1); dz = rng.range(-1, 1); d = Math.hypot(dx, dz); }
        const push = (MIN_SEPARATION - d) / 2 + 0.01;
        a.x += (dx / d) * push; a.z += (dz / d) * push;
        b.x -= (dx / d) * push; b.z -= (dz / d) * push;
        moved = true;
      }
    }
    if (!moved) return;
  }
}

export function computeLayout(plan: StructurePlan): Layout {
  const rng = makeRng(hashName(plan.name)).fork('layout');
  const levelOf = new Map<SpaceId, number>(plan.spaces.map((s) => [s.id, s.level]));
  const levels = [...new Set(plan.spaces.map((s) => s.level))].sort((a, b) => a - b);
  const xz = new Map<SpaceId, { x: number; z: number }>();

  for (const level of levels) {
    const ids = plan.spaces.filter((s) => s.level === level).map((s) => s.id);
    if (ids.every((id) => GRID_ID.test(id))) {
      for (const id of ids) {
        const m = GRID_ID.exec(id)!;
        xz.set(id, { x: (Number(m[3]) - 1) * CELL_SPACING, z: (m[2]!.charCodeAt(0) - 65) * CELL_SPACING });
      }
    } else {
      const edges = plan.edges
        .filter((e) => levelOf.get(e.a) === level && levelOf.get(e.b) === level && e.a !== e.b)
        .map((e): [SpaceId, SpaceId] => [e.a, e.b]);
      for (const [id, p] of forceLayout(ids, edges, rng)) xz.set(id, p);
    }
  }

  // Vertical columns: union-find over edges that cross levels. Members share x and z.
  const parent = new Map<SpaceId, SpaceId>(plan.spaces.map((s) => [s.id, s.id]));
  const find = (id: SpaceId): SpaceId => {
    let r = id;
    while (parent.get(r) !== r) r = parent.get(r)!;
    let cur = id;
    while (parent.get(cur) !== r) { const next = parent.get(cur)!; parent.set(cur, r); cur = next; }
    return r;
  };
  for (const e of plan.edges) {
    if (levelOf.get(e.a) !== undefined && levelOf.get(e.a) !== levelOf.get(e.b)) parent.set(find(e.a), find(e.b));
  }
  const groupsById = new Map<SpaceId, { members: SpaceId[]; levels: Set<number>; x: number; z: number }>();
  for (const s of plan.spaces) {
    const root = find(s.id);
    const g = groupsById.get(root) ?? { members: [], levels: new Set<number>(), x: 0, z: 0 };
    g.members.push(s.id);
    g.levels.add(s.level);
    groupsById.set(root, g);
  }
  const groups = [...groupsById.values()];
  for (const g of groups) {
    g.x = g.members.reduce((acc, id) => acc + xz.get(id)!.x, 0) / g.members.length;
    g.z = g.members.reduce((acc, id) => acc + xz.get(id)!.z, 0) / g.members.length;
  }
  separate(groups, rng);

  // Center on the origin so the camera has a sane target.
  const cx = groups.reduce((acc, g) => acc + g.x, 0) / Math.max(1, groups.length);
  const cz = groups.reduce((acc, g) => acc + g.z, 0) / Math.max(1, groups.length);
  const out: Layout = {};
  for (const g of groups) {
    for (const id of g.members) {
      out[id] = { x: round3(g.x - cx), y: yOf(levelOf.get(id)!), z: round3(g.z - cz) };
    }
  }
  return out;
}

const round3 = (v: number): number => Math.round(v * 1000) / 1000;

const cache = new WeakMap<StructurePlan, Layout>();
/** Memoized per plan object. Plans are immutable JSON, so this is safe. */
export function layoutFor(plan: StructurePlan): Layout {
  const hit = cache.get(plan);
  if (hit) return hit;
  const l = computeLayout(plan);
  cache.set(plan, l);
  return l;
}

/** Bounding box of a layout, for camera placement. */
export function layoutBounds(layout: Layout): { min: Pos; max: Pos; center: Pos } {
  const ps = Object.values(layout);
  if (ps.length === 0) return { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 }, center: { x: 0, y: 0, z: 0 } };
  const min = { x: Infinity, y: Infinity, z: Infinity };
  const max = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const p of ps) {
    min.x = Math.min(min.x, p.x); min.y = Math.min(min.y, p.y); min.z = Math.min(min.z, p.z);
    max.x = Math.max(max.x, p.x); max.y = Math.max(max.y, p.y); max.z = Math.max(max.z, p.z);
  }
  return { min, max, center: { x: (min.x + max.x) / 2, y: (min.y + max.y) / 2, z: (min.z + max.z) / 2 } };
}
