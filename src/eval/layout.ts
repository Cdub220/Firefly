/**
 * Level-aware layout for the split view. One algorithm, computed once per run in
 * buildViewerData and shipped as plain JSON (`ViewerData.layout`), so the live React view
 * (src/ui/split/svg.ts) and the standalone exported HTML (viewer.template.html, plain JS)
 * draw from identical positions without duplicating the algorithm.
 *
 *  - Spaces are grouped by `level`. Each level is a horizontal band; higher levels sit
 *    higher on the SVG. Bands are labelled "LEVEL n" at the left (multi-level plans only:
 *    the single-level six-space ring renders exactly as it always has).
 *  - Within a band, ids matching the generator pattern "L{n}-{ROW}{col}" go on that grid.
 *    Otherwise a deterministic BFS over same-level edges from the lowest id orders the
 *    spaces, wrapped into rows. Spaces joined by a vertical ('floor' / 'shaft') edge share
 *    x, so vertical edges are vertical: a space takes the column of its partner below.
 *  - Cell size scales with the space count: 6 spaces at full size, 24 at ~70%.
 */
import type { Edge, SpaceId } from '../shared/types';

export type LayoutPlan = { spaces: Array<{ id: SpaceId; level: number }>; edges: Edge[] };

export type Band = { level: number; label: string; y: number; h: number };

/**
 * A floor / shaft connector drawn in the gap between two bands, from the upper space's
 * column to the lower partner's column (the same x on grid plans; slanted only when
 * several upper spaces share one partner below and could not all inherit its column).
 */
export type Vertical = { x1: number; y1: number; x2: number; y2: number; kind: 'floor' | 'shaft' };

export type Layout = {
  pos: Record<SpaceId, { x: number; y: number }>;
  W: number;
  H: number;
  CW: number;
  CH: number;
  /** 1 for six spaces, down to 0.7 for 24 or more. Fonts scale with it (floored). */
  scale: number;
  /** Top to bottom. Empty for single-level plans (no band labels drawn). */
  bands: Band[];
  /** Left margin reserved for band labels (0 on single-level plans). */
  labelW: number;
  /** Edge kind/rate labels are drawn only on small plans; larger ones get a legend. */
  labelEdges: boolean;
  /** Vertical connectors between bands, one per column and gap; shaft wins over floor. */
  vertical: Vertical[];
  /**
   * Same-level edges whose straight centre-to-centre line would pass through a third
   * cell (a flattened row's cross-row passages, mostly). Renderers route these as a
   * bracket below the row instead of drawing a phantom link through the cell between.
   */
  detours: Array<{ a: SpaceId; b: SpaceId }>;
};

const BASE_CW = 104;
const BASE_CH = 100;
const BASE_PX = 146; // horizontal pitch
const BASE_PY = 134; // vertical pitch
const MARGIN = 12;
const BAND_GAP = 44; // vertical room between bands for floor / shaft lines
const LABEL_W = 58;
const MAX_EDGE_LABELS = 8; // spaces
const MIN_SCALE = 0.7;
const FULL_SIZE_AT = 6;
const MIN_SCALE_AT = 24;
// A stack of many small levels (a tower: 5 levels of 2x2) would be far taller than wide
// and the panel would stretch it to several screens. Above this height/width ratio each
// level's rows are flattened into one row (row-major, so floor edges still align).
const MAX_ASPECT = 1.6;

/** The six-space ring, exactly as the split view has always drawn demo-6. */
const RING: Record<string, [number, number]> = { S1: [0, 0], S2: [1, 0], S3: [2, 0], S6: [0, 1], S5: [1, 1], S4: [2, 1] };

const GEN_ID = /^L(\d+)-([A-Z])(\d+)$/;
const ROW_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export function scaleFor(n: number): number {
  if (n <= FULL_SIZE_AT) return 1;
  const t = (n - FULL_SIZE_AT) / (MIN_SCALE_AT - FULL_SIZE_AT);
  return Math.max(MIN_SCALE, 1 - t * (1 - MIN_SCALE));
}

const isVertical = (e: Edge): boolean => e.kind === 'floor' || e.kind === 'shaft';

/** Column/row slot per space within its level, before pixel placement. */
type Slot = { col: number; row: number };

function gridSlots(ids: SpaceId[]): Map<SpaceId, Slot> | null {
  const out = new Map<SpaceId, Slot>();
  for (const id of ids) {
    const m = GEN_ID.exec(id);
    if (!m) return null;
    out.set(id, { row: ROW_LETTERS.indexOf(m[2]!), col: Number(m[3]) - 1 });
  }
  return out;
}

/** Deterministic BFS order over same-level edges from the lowest id; isolated spaces last, by id. */
function bfsOrder(ids: SpaceId[], edges: Edge[]): SpaceId[] {
  const inLevel = new Set(ids);
  const adj = new Map<SpaceId, SpaceId[]>(ids.map((id) => [id, []]));
  for (const e of edges) {
    if (isVertical(e) || !inLevel.has(e.a) || !inLevel.has(e.b)) continue;
    adj.get(e.a)!.push(e.b);
    adj.get(e.b)!.push(e.a);
  }
  for (const list of adj.values()) list.sort();
  const sorted = [...ids].sort();
  const seen = new Set<SpaceId>();
  const order: SpaceId[] = [];
  for (const start of sorted) {
    if (seen.has(start)) continue;
    seen.add(start);
    const queue = [start];
    while (queue.length) {
      const cur = queue.shift()!;
      order.push(cur);
      for (const n of adj.get(cur) ?? []) {
        if (!seen.has(n)) {
          seen.add(n);
          queue.push(n);
        }
      }
    }
  }
  return order;
}

export function layoutPlan(plan: LayoutPlan): Layout {
  const ids = plan.spaces.map((s) => s.id);
  const n = ids.length;
  const scale = scaleFor(n);
  const CW = Math.round(BASE_CW * scale);
  const CH = Math.round(BASE_CH * scale);
  const PX = Math.round(BASE_PX * scale);
  const PY = Math.round(BASE_PY * scale);
  const labelEdges = n <= MAX_EDGE_LABELS;
  const pos: Record<SpaceId, { x: number; y: number }> = {};

  const levels = [...new Set(plan.spaces.map((s) => s.level))].sort((a, b) => a - b);
  const multiLevel = levels.length > 1;

  if (n === 0) return { pos, W: 2 * MARGIN, H: 2 * MARGIN, CW, CH, scale, bands: [], labelW: 0, labelEdges, vertical: [], detours: [] };

  // The ring: unchanged.
  if (!multiLevel && n === 6 && ids.every((id) => Object.hasOwn(RING, id))) {
    for (const id of ids) {
      const [col, row] = RING[id]!;
      pos[id] = { x: MARGIN + col * PX, y: MARGIN + row * PY };
    }
    return { pos, CW, CH, scale, bands: [], labelW: 0, labelEdges, vertical: [], detours: [], W: MARGIN + 2 * PX + CW + MARGIN, H: MARGIN + PY + CH + MARGIN };
  }

  // Slots per level, bottom-up so a space can take the column of its partner below.
  const byLevel = new Map<number, SpaceId[]>(levels.map((l) => [l, plan.spaces.filter((s) => s.level === l).map((s) => s.id)]));
  const slots = new Map<SpaceId, Slot>();
  const rowsOf = new Map<number, number>();
  const maxPerLevel = Math.max(...[...byLevel.values()].map((l) => l.length));
  const wrapCols = Math.max(3, Math.ceil(Math.sqrt(maxPerLevel)));
  // One column count for flattening across all levels, so floor edges stay vertical even
  // when levels have different grid widths.
  const gridColsAll = Math.max(
    1,
    ...[...byLevel.values()].map((members) => {
      const g = gridSlots(members);
      return g ? 1 + Math.max(...[...g.values()].map((s) => s.col)) : 1;
    }),
  );
  const below = new Map<SpaceId, SpaceId>(); // upper -> lower partner through a vertical edge
  const levelOf = new Map(plan.spaces.map((s) => [s.id, s.level]));
  for (const e of plan.edges) {
    if (!isVertical(e)) continue;
    const la = levelOf.get(e.a);
    const lb = levelOf.get(e.b);
    if (la === undefined || lb === undefined || la === lb) continue;
    const [upper, lower] = la > lb ? [e.a, e.b] : [e.b, e.a];
    if (!below.has(upper)) below.set(upper, lower);
  }
  const place = (flatten: boolean): void => {
    slots.clear();
    rowsOf.clear();
    for (const level of levels) placeLevel(level, flatten);
  };
  const placeLevel = (level: number, flatten: boolean): void => {
    const members = byLevel.get(level)!;
    const grid = gridSlots(members);
    if (grid) {
      for (const [id, s] of grid) slots.set(id, flatten ? { col: s.row * gridColsAll + s.col, row: 0 } : s);
      rowsOf.set(level, flatten ? 1 : 1 + Math.max(...members.map((id) => grid.get(id)!.row)));
      return;
    }
    const order = bfsOrder(members, plan.edges);
    const taken = new Set<string>();
    const pending: SpaceId[] = [];
    // First pass: inherit the column (and row) of the partner below, if free.
    for (const id of order) {
      const lower = below.get(id);
      const s = lower !== undefined ? slots.get(lower) : undefined;
      if (s && !taken.has(`${s.col},${s.row}`)) {
        slots.set(id, { col: s.col, row: s.row });
        taken.add(`${s.col},${s.row}`);
      } else pending.push(id);
    }
    // Second pass: fill the remaining slots in BFS order.
    const cols = flatten ? Math.max(wrapCols, members.length) : wrapCols;
    let k = 0;
    for (const id of pending) {
      while (taken.has(`${k % cols},${Math.floor(k / cols)}`)) k++;
      const s = { col: k % cols, row: Math.floor(k / cols) };
      slots.set(id, s);
      taken.add(`${s.col},${s.row}`);
      k++;
    }
    rowsOf.set(level, 1 + Math.max(...members.map((id) => slots.get(id)!.row)));
  };

  const labelW = multiLevel ? LABEL_W : 0;
  const build = (): Omit<Layout, 'vertical' | 'detours'> => {
    const cols = 1 + Math.max(...[...slots.values()].map((s) => s.col));
    const bands: Band[] = [];
    const out: Record<SpaceId, { x: number; y: number }> = {};
    let y = MARGIN;
    for (const level of [...levels].reverse()) {
      const rows = rowsOf.get(level)!;
      const h = (rows - 1) * PY + CH;
      if (multiLevel) bands.push({ level, label: `LEVEL ${level}`, y, h });
      for (const id of byLevel.get(level)!) {
        const s = slots.get(id)!;
        out[id] = { x: MARGIN + labelW + s.col * PX, y: y + s.row * PY };
      }
      y += h + BAND_GAP;
    }
    const H = y - BAND_GAP + MARGIN;
    const W = MARGIN + labelW + (cols - 1) * PX + CW + MARGIN;
    return { pos: out, W, H, CW, CH, scale, bands, labelW, labelEdges };
  };
  place(false);
  let partial = build();
  if (multiLevel && partial.H / partial.W > MAX_ASPECT) {
    place(true);
    const flat = build();
    if (flat.H / flat.W < partial.H / partial.W) partial = flat;
  }
  return { ...partial, vertical: verticalConnectors(plan, partial), detours: detours(plan, partial) };
}

/** Does the segment p-q cross the rectangle r (with a small inset so touching edges do not count)? */
function crosses(p: { x: number; y: number }, q: { x: number; y: number }, r: { x: number; y: number }, w: number, h: number): boolean {
  const inset = 2;
  const x0 = r.x + inset, y0 = r.y + inset, x1 = r.x + w - inset, y1 = r.y + h - inset;
  // Liang-Barsky clipping of p->q against the rectangle.
  let t0 = 0, t1 = 1;
  const dx = q.x - p.x, dy = q.y - p.y;
  const checks: Array<[number, number]> = [[-dx, p.x - x0], [dx, x1 - p.x], [-dy, p.y - y0], [dy, y1 - p.y]];
  for (const [pk, qk] of checks) {
    if (pk === 0) { if (qk < 0) return false; continue; }
    const t = qk / pk;
    if (pk < 0) { if (t > t1) return false; if (t > t0) t0 = t; }
    else { if (t < t0) return false; if (t < t1) t1 = t; }
  }
  return t0 < t1;
}

/** Same-level edges whose straight line passes through a third cell. */
function detours(plan: LayoutPlan, layout: Omit<Layout, 'vertical' | 'detours'>): Array<{ a: SpaceId; b: SpaceId }> {
  const levelOf = new Map(plan.spaces.map((s) => [s.id, s.level]));
  const out: Array<{ a: SpaceId; b: SpaceId }> = [];
  for (const e of plan.edges) {
    if (levelOf.get(e.a) !== levelOf.get(e.b)) continue;
    const a = layout.pos[e.a];
    const b = layout.pos[e.b];
    if (!a || !b) continue;
    const p = { x: a.x + layout.CW / 2, y: a.y + layout.CH / 2 };
    const q = { x: b.x + layout.CW / 2, y: b.y + layout.CH / 2 };
    const blocked = plan.spaces.some((s) => s.id !== e.a && s.id !== e.b && layout.pos[s.id] !== undefined && crosses(p, q, layout.pos[s.id]!, layout.CW, layout.CH));
    if (blocked) out.push({ a: e.a, b: e.b });
  }
  return out;
}

/**
 * Vertical (floor / shaft) connectors to draw between bands: one per (column x, gap),
 * the shaft winning over the floor where both exist, spanning the gap between the two
 * bands. Rows within a band share a column, so several floor edges collapse into one
 * line; the legend says so.
 */
function verticalConnectors(plan: LayoutPlan, layout: Omit<Layout, 'vertical' | 'detours'>): Vertical[] {
  const out = new Map<string, Vertical>();
  const levelOf = new Map(plan.spaces.map((s) => [s.id, s.level]));
  const bandOf = (p: { y: number }): Band | undefined => layout.bands.find((band) => p.y >= band.y && p.y < band.y + band.h);
  for (const e of plan.edges) {
    if (!isVertical(e)) continue;
    const a = layout.pos[e.a];
    const b = layout.pos[e.b];
    if (!a || !b || levelOf.get(e.a) === levelOf.get(e.b)) continue;
    const [upper, lower] = a.y < b.y ? [a, b] : [b, a];
    const bandUpper = bandOf(upper);
    const bandLower = bandOf(lower);
    if (!bandUpper || !bandLower) continue;
    const y1 = bandUpper.y + bandUpper.h;
    const y2 = bandLower.y;
    const x1 = upper.x + layout.CW / 2;
    const x2 = lower.x + layout.CW / 2;
    const key = `${x1},${y1},${x2},${y2}`;
    const kind = e.kind === 'shaft' ? 'shaft' : 'floor';
    const prev = out.get(key);
    if (!prev || (prev.kind === 'floor' && kind === 'shaft')) out.set(key, { x1, y1, x2, y2, kind });
  }
  return [...out.values()].sort((p, q) => p.y1 - q.y1 || p.x1 - q.x1 || p.x2 - q.x2);
}
