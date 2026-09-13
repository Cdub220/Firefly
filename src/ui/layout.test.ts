import { describe, expect, it } from 'vitest';
import { makeRng } from '../shared/rng';
import type { StructurePlan } from '../shared/types';
import { loadPlan, PLAN_NAMES } from '../shared/structures';
import { CELL_SPACING, computeLayout, LEVEL_SPACING, layoutBounds, layoutFor } from './layout';

const dist2d = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

/**
 * An irregular three-level plan (12 + 10 + 8 spaces, random same-level edges, floor and
 * shaft links) where column averaging pulls same-level spaces together, so the separation
 * pass has real work to do. Deterministic via the seed.
 */
function irregular(seed: number): StructurePlan {
  const rng = makeRng(seed);
  const spaces: StructurePlan['spaces'] = [];
  const edges: StructurePlan['edges'] = [];
  const perLevel = [12, 10, 8];
  perLevel.forEach((n, li) => { for (let i = 0; i < n; i++) spaces.push({ id: `R${li + 1}_${i}`, level: li + 1 }); });
  perLevel.forEach((n, li) => {
    for (let i = 0; i < n; i++) {
      const j = rng.int(0, n - 1);
      if (j !== i) edges.push({ a: `R${li + 1}_${i}`, b: `R${li + 1}_${j}`, kind: rng.next() < 0.7 ? 'door' : 'bulkhead', rate: 0.1 });
      if (i + 1 < n) edges.push({ a: `R${li + 1}_${i}`, b: `R${li + 1}_${i + 1}`, kind: 'passage', rate: 0.1 });
    }
  });
  for (let i = 0; i < 8; i++) edges.push({ a: `R1_${i}`, b: `R2_${i}`, kind: 'floor', rate: 0.05 });
  for (let i = 0; i < 6; i++) edges.push({ a: `R2_${i}`, b: `R3_${i}`, kind: i === 0 ? 'shaft' : 'floor', rate: 0.05 });
  return { name: `irregular-${seed}`, ambient: 22, spaces, edges, sensors: [], resupply: ['R1_0'], ignition: ['R1_0'] };
}

const FIXTURES = (): StructurePlan[] => [RING, irregular(1), irregular(2), irregular(3), ...PLAN_NAMES.map(loadPlan)];

/** A non-grid, two-level plan so the force layout and column alignment both run. */
const RING: StructurePlan = {
  name: 'ring-2',
  ambient: 22,
  spaces: [
    { id: 'A', level: 1 }, { id: 'B', level: 1 }, { id: 'C', level: 1 }, { id: 'D', level: 1 }, { id: 'E', level: 1 },
    { id: 'A2', level: 2 }, { id: 'C2', level: 2 }, { id: 'X2', level: 2 },
  ],
  edges: [
    { a: 'A', b: 'B', kind: 'door', rate: 0.1 }, { a: 'B', b: 'C', kind: 'door', rate: 0.1 },
    { a: 'C', b: 'D', kind: 'door', rate: 0.1 }, { a: 'D', b: 'E', kind: 'door', rate: 0.1 },
    { a: 'E', b: 'A', kind: 'bulkhead', rate: 0.05 },
    { a: 'A', b: 'A2', kind: 'floor', rate: 0.05 }, { a: 'C', b: 'C2', kind: 'shaft', rate: 0.3 },
    { a: 'A2', b: 'X2', kind: 'door', rate: 0.1 }, { a: 'C2', b: 'X2', kind: 'door', rate: 0.1 },
  ],
  sensors: [],
  resupply: ['A'],
  ignition: ['C'],
};

describe('layout', () => {
  it('gives the same layout for the same plan twice, and memoizes per plan object', () => {
    for (const plan of FIXTURES()) {
      expect(JSON.stringify(computeLayout(plan))).toBe(JSON.stringify(computeLayout(plan)));
      expect(layoutFor(plan)).toBe(layoutFor(plan));
      expect(JSON.stringify(layoutFor(plan))).toBe(JSON.stringify(computeLayout(plan)));
    }
  });

  it('stacks levels on y with LEVEL_SPACING', () => {
    for (const plan of FIXTURES()) {
      const l = computeLayout(plan);
      for (const s of plan.spaces) expect(l[s.id]!.y).toBe((s.level - 1) * LEVEL_SPACING);
    }
  });

  it('spaces joined by a floor or shaft edge share x and z', () => {
    for (const plan of FIXTURES()) {
      const l = computeLayout(plan);
      const level = new Map(plan.spaces.map((s) => [s.id, s.level]));
      for (const e of plan.edges) {
        if (level.get(e.a) === level.get(e.b)) continue;
        expect(l[e.a]!.x).toBeCloseTo(l[e.b]!.x, 6);
        expect(l[e.a]!.z).toBeCloseTo(l[e.b]!.z, 6);
      }
    }
  });

  it('no two same-level spaces overlap (distance > 1.5), including after column averaging', () => {
    for (const plan of FIXTURES()) {
      const l = computeLayout(plan);
      for (const a of plan.spaces) {
        for (const b of plan.spaces) {
          if (a.id >= b.id || a.level !== b.level) continue;
          expect(dist2d(l[a.id]!, l[b.id]!), `${plan.name}: ${a.id} vs ${b.id}`).toBeGreaterThan(1.5);
        }
      }
    }
  });

  it('different plan names give different force layouts; edges to unknown ids are ignored', () => {
    const a = computeLayout(RING);
    const b = computeLayout({ ...RING, name: 'ring-2-renamed' });
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
    // Two bad edges from two different columns must not merge those columns onto one point.
    const withBad: StructurePlan = {
      ...RING,
      edges: [...RING.edges, { a: 'A', b: 'NOPE', kind: 'floor', rate: 0.1 }, { a: 'C', b: 'ALSO-NOPE', kind: 'floor', rate: 0.1 }],
    };
    expect(JSON.stringify(computeLayout(withBad))).toBe(JSON.stringify(a));
  });

  it('places generator ids on a grid with CELL_SPACING', () => {
    const l = computeLayout(loadPlan('vessel-3x8'));
    expect(l['L1-A2']!.x - l['L1-A1']!.x).toBeCloseTo(CELL_SPACING, 6);
    expect(l['L1-B1']!.z - l['L1-A1']!.z).toBeCloseTo(CELL_SPACING, 6);
    expect(l['L1-B1']!.x).toBeCloseTo(l['L1-A1']!.x, 6);
    expect(l['L3-B4']!.y).toBe(2 * LEVEL_SPACING);
  });

  it('centers the layout and reports bounds', () => {
    const l = computeLayout(loadPlan('tower-5x4'));
    const b = layoutBounds(l);
    expect(b.center.x).toBeCloseTo(0, 6);
    expect(b.center.z).toBeCloseTo(0, 6);
    expect(b.max.y).toBe(4 * LEVEL_SPACING);
    expect(b.min.y).toBe(0);
  });

  it('keeps connected same-level spaces nearer than unconnected ones in a force layout', () => {
    const l = computeLayout(RING);
    // A-B are joined by a door; A-C are two hops apart on a ring of five.
    expect(dist2d(l['A']!, l['B']!)).toBeLessThan(dist2d(l['A']!, l['C']!));
  });
});
