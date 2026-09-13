/**
 * Structure plan generator. Pure and deterministic: the same options always give the
 * same plan, so `npm run gen:plans` can regenerate data/structures/*.json and a test can
 * assert the committed files match. Nothing here names a ship or a tower; a plan is
 * levels, a grid of spaces per level, and edges with rates.
 *
 * Grid layout per level: `rows` rows (letters A, B, ...) by `cols` columns (1, 2, ...).
 * Rows run along the long axis, so lay grids out with cols >= rows. Within a row,
 * neighbours are joined by 'door'; across rows by 'passage'. Every space is joined to
 * the space above it by a 'floor' edge. One 'shaft' chain runs through `shaftAt` on every
 * level, in addition to that column's floor edges (both carry heat; the rates add).
 */
import type { Edge, Hazard, PlanSpace, SpaceId, StructurePlan } from '../shared/types';

export type GridPlanOptions = {
  name: string;
  levels: number;
  rows: number;
  cols: number;
  ambient?: number; // default 22
  doorRate: number;
  passageRate: number;
  floorRate: number;
  shaftRate: number;
  /** [row, col], zero-based, of the shaft on every level. Omit for no shaft. */
  shaftAt?: [number, number];
  /** Spaces that get no fixed sensor. Everything else gets one, id `F-${spaceId}`. */
  sensorless?: SpaceId[];
  hazards?: Record<SpaceId, Hazard>;
  occupants?: Record<SpaceId, number>;
  resupply: SpaceId[];
  ignition: SpaceId[];
};

const ROW_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** Space id for (level, row, col), all zero-based except level which is 1-based in the id. */
export function spaceId(level: number, row: number, col: number): SpaceId {
  const letter = ROW_LETTERS[row];
  if (letter === undefined) throw new Error(`gen: row ${row} exceeds ${ROW_LETTERS.length}`);
  return `L${level}-${letter}${col + 1}`;
}

/** Parse a generator-style id back to {level, row, col}, or null if it is not one. */
export function parseSpaceId(id: SpaceId): { level: number; row: number; col: number } | null {
  const m = /^L(\d+)-([A-Z])(\d+)$/.exec(id);
  if (!m) return null;
  return { level: Number(m[1]), row: ROW_LETTERS.indexOf(m[2]!), col: Number(m[3]) - 1 };
}

export function makeGridPlan(opts: GridPlanOptions): StructurePlan {
  const { levels, rows, cols } = opts;
  if (levels < 1 || rows < 1 || cols < 1) throw new Error('gen: levels, rows and cols must be >= 1');
  if (opts.shaftAt) {
    const [r, c] = opts.shaftAt;
    if (r < 0 || r >= rows || c < 0 || c >= cols) throw new Error(`gen: shaftAt [${r}, ${c}] is outside the grid`);
  }
  const sensorless = new Set(opts.sensorless ?? []);
  const hazards = opts.hazards ?? {};
  const occupants = opts.occupants ?? {};

  const spaces: PlanSpace[] = [];
  const edges: Edge[] = [];
  for (let level = 1; level <= levels; level++) {
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const id = spaceId(level, row, col);
        const space: PlanSpace = { id, level };
        const hazard = hazards[id];
        if (hazard !== undefined && hazard !== 'none') space.hazard = hazard;
        const occ = occupants[id];
        if (occ !== undefined && occ > 0) space.occupants = occ;
        spaces.push(space);
        // Along the row: door. Across rows: passage. Up: floor.
        if (col + 1 < cols) edges.push({ a: id, b: spaceId(level, row, col + 1), kind: 'door', rate: opts.doorRate });
        if (row + 1 < rows) edges.push({ a: id, b: spaceId(level, row + 1, col), kind: 'passage', rate: opts.passageRate });
        if (level + 1 <= levels) edges.push({ a: id, b: spaceId(level + 1, row, col), kind: 'floor', rate: opts.floorRate });
      }
    }
  }
  if (opts.shaftAt) {
    const [r, c] = opts.shaftAt;
    for (let level = 1; level < levels; level++) {
      edges.push({ a: spaceId(level, r, c), b: spaceId(level + 1, r, c), kind: 'shaft', rate: opts.shaftRate });
    }
  }

  const plan: StructurePlan = {
    name: opts.name,
    ambient: opts.ambient ?? 22,
    spaces,
    edges,
    sensors: spaces.filter((s) => !sensorless.has(s.id)).map((s) => ({ id: `F-${s.id}`, spaceId: s.id })),
    resupply: [...opts.resupply],
    ignition: [...opts.ignition],
  };
  for (const id of [...sensorless, ...Object.keys(hazards), ...Object.keys(occupants), ...plan.resupply, ...plan.ignition]) {
    if (!spaces.some((s) => s.id === id)) throw new Error(`gen: "${opts.name}" references unknown space ${id}`);
  }
  return plan;
}

/** The plans this repo ships. The generator is the source; data/structures/*.json is output. */
export const PLAN_SPECS: Record<string, GridPlanOptions> = {
  'vessel-3x8': {
    name: 'vessel-3x8',
    levels: 3,
    rows: 2,
    cols: 4,
    doorRate: 0.15,
    passageRate: 0.2,
    floorRate: 0.08, // steel conducts
    shaftRate: 0.3,
    shaftAt: [0, 0],
    // Two interior spaces on level 2 have no sensor: a realistic gap in the alarm loop.
    sensorless: ['L2-B2', 'L2-B3'],
    hazards: { 'L1-B3': 'fuel', 'L2-A4': 'ordnance' },
    occupants: {
      'L1-A2': 1, 'L1-A4': 2, 'L1-B1': 1,
      'L2-A1': 2, 'L2-A3': 1, 'L2-B2': 3, 'L2-B4': 2,
      'L3-A1': 4, 'L3-A2': 6, 'L3-A3': 5, 'L3-A4': 3, 'L3-B1': 4, 'L3-B2': 6, 'L3-B3': 5, 'L3-B4': 4,
    },
    resupply: ['L1-A1'],
    ignition: ['L1-B3'],
  },
  'tower-5x4': {
    name: 'tower-5x4',
    levels: 5,
    rows: 2,
    cols: 2,
    doorRate: 0.15,
    passageRate: 0.15,
    floorRate: 0.04, // concrete slabs conduct poorly
    shaftRate: 0.35, // stairwell; stack effect is a high rate
    shaftAt: [0, 0],
    // Level 4's alarm loop is dead.
    sensorless: ['L4-A1', 'L4-A2', 'L4-B1', 'L4-B2'],
    occupants: {
      'L1-A2': 2, 'L1-B2': 3,
      'L2-A2': 4, 'L2-B1': 2, 'L2-B2': 5,
      'L3-A2': 3, 'L3-B1': 4, 'L3-B2': 4,
      'L4-A2': 5, 'L4-B1': 3, 'L4-B2': 6,
      'L5-A2': 2, 'L5-B1': 4, 'L5-B2': 3,
    },
    resupply: ['L1-A1'],
    ignition: ['L2-B2'],
  },
};
