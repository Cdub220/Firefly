/**
 * Test fixtures: a grid plan in the shape of the plan generator's output (ids
 * "L{level}-{ROW}{col}", 'door' along rows, 'passage' across rows, 'floor' between
 * vertically adjacent spaces, one 'shaft' chain at a corner). Used by layout, store and
 * export tests so they do not depend on which plan files exist in data/structures.
 * Not a structure anyone runs a demo on; those are JSON files.
 */
import type { Edge, PlanSpace, SpaceId, StructurePlan } from '../shared/types';

const ROW_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export type GridFixtureOptions = {
  name?: string;
  levels: number;
  rows: number;
  cols: number;
  /** Spaces that get no fixed sensor. */
  sensorless?: SpaceId[];
  /** Ignition space; default the first space on level 1. */
  ignition?: SpaceId[];
};

export function gridId(level: number, row: number, col: number): SpaceId {
  return `L${level}-${ROW_LETTERS[row]}${col + 1}`;
}

export function makeGridFixture(o: GridFixtureOptions): StructurePlan {
  const spaces: PlanSpace[] = [];
  const edges: Edge[] = [];
  for (let level = 1; level <= o.levels; level++) {
    for (let row = 0; row < o.rows; row++) {
      for (let col = 0; col < o.cols; col++) {
        const id = gridId(level, row, col);
        spaces.push({ id, level });
        if (col + 1 < o.cols) edges.push({ a: id, b: gridId(level, row, col + 1), kind: 'door', rate: 0.15 });
        if (row + 1 < o.rows) edges.push({ a: id, b: gridId(level, row + 1, col), kind: 'passage', rate: 0.2 });
        if (level + 1 <= o.levels) edges.push({ a: id, b: gridId(level + 1, row, col), kind: 'floor', rate: 0.08 });
      }
    }
    if (level + 1 <= o.levels) edges.push({ a: gridId(level, 0, 0), b: gridId(level + 1, 0, 0), kind: 'shaft', rate: 0.3 });
  }
  const sensorless = new Set(o.sensorless ?? []);
  return {
    name: o.name ?? `grid-${o.levels}x${o.rows * o.cols}`,
    ambient: 22,
    spaces,
    edges,
    sensors: spaces.filter((s) => !sensorless.has(s.id)).map((s) => ({ id: `F-${s.id}`, spaceId: s.id })),
    resupply: [gridId(1, 0, 0)],
    ignition: o.ignition ?? [gridId(1, 0, 0)],
  };
}
