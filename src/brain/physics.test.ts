import { describe, expect, it } from 'vitest';
import { COOL, FLAME_TEMP, forward, GEN_RATE, MAX_TETHERS, maxDrop, maxRise, steadyState, TETHER_COOL, TETHER_SUPPRESSION } from './physics';
import type { StructurePlan } from '../shared/types';

const plan: StructurePlan = {
  name: 'test-3',
  ambient: 20,
  spaces: [
    { id: 'A', level: 1 },
    { id: 'B', level: 1 },
    { id: 'C', level: 1 },
  ],
  edges: [
    { a: 'A', b: 'B', kind: 'door', rate: 0.15 },
    { a: 'B', b: 'C', kind: 'door', rate: 0.15 },
  ],
  sensors: [],
  resupply: ['A'],
  ignition: ['A'],
};

describe('physics', () => {
  it('forward matches the hand-computed linear model', () => {
    const temps = { A: 450, B: 20, C: 20 };
    const out = forward(plan, temps, new Set(['A']));
    // A: transfer 0.15*(20-450) = -64.5; cool 0.02*(20-450) = -8.6; gen 0.25*(900-450) = 112.5
    expect(out['A']).toBeCloseTo(450 - 64.5 - 8.6 + 112.5, 6);
    // B: 0.15*(450-20) + 0.15*(20-20) = 64.5; cool 0
    expect(out['B']).toBeCloseTo(20 + 64.5, 6);
    expect(out['C']).toBeCloseTo(20, 6);
  });

  it('steadyState converges, burns hot at the fire and warm next door, and caches', () => {
    const a = steadyState(plan, new Set(['A']));
    expect(a['A']).toBeGreaterThan(500);
    expect(a['A']).toBeLessThanOrEqual(FLAME_TEMP);
    expect(a['B']).toBeGreaterThan(a['C']!);
    expect(a['C']).toBeGreaterThan(plan.ambient);
    expect(steadyState(plan, new Set(['A']))).toBe(a); // cached: same object back
    expect(steadyState(plan, new Set(['B']))).not.toBe(a);
  });

  it('no burning set decays to ambient', () => {
    const s = steadyState(plan, new Set());
    for (const id of ['A', 'B', 'C']) expect(s[id]).toBeCloseTo(20, 1);
  });

  it('maxRise bounds every honest forward step; maxDrop bounds honest cooling', () => {
    let temps: Record<string, number> = { A: 450, B: 20, C: 20 };
    for (let i = 0; i < 30; i++) {
      const next = forward(plan, temps, new Set(['A']));
      for (const id of ['A', 'B', 'C']) {
        expect(next[id]! - temps[id]!).toBeLessThanOrEqual(maxRise(plan, id, temps) + 1e-9);
        expect(temps[id]! - next[id]!).toBeLessThanOrEqual(maxDrop(plan, id, temps) + 1e-9);
      }
      temps = next;
    }
    // Sanity on the constants themselves.
    expect(GEN_RATE).toBe(0.25);
    expect(COOL).toBe(0.02);
  });

  it('suppression: two tethers on a burning 800 C space give the world\'s formula; tethers on a cold space only cool; three count as MAX_TETHERS', () => {
    expect(TETHER_SUPPRESSION).toBe(0.3);
    expect(MAX_TETHERS).toBe(2);
    const temps = { A: 800, B: 20, C: 20 };
    const plain = forward(plan, temps, new Set(['A']));
    const two = forward(plan, temps, new Set(['A']), new Map([['A', 2]]));
    // A without water: transfer 0.15*(20-800) = -117; cool 0.02*(20-800) = -15.6; gen 0.25*(900-800) = 25.
    expect(plain['A']).toBeCloseTo(800 - 117 - 15.6 + 25, 6);
    // A with two tethers: generation x 0.3^2 = 0.09 -> 2.25; extra cooling 2 * 0.1 * (20-800) = -156.
    expect(two['A']).toBeCloseTo(800 - 117 - 15.6 + 0.25 * 0.09 * 100 + 2 * TETHER_COOL * (20 - 800), 6);
    expect(two['A']).toBeLessThan(plain['A']!);
    // Neighbours are untouched by A's tethers.
    expect(two['B']).toBeCloseTo(plain['B']!, 9);
    // A space with tethers but not burning only cools: B at 300, one tether, no generation.
    const cold = forward(plan, { A: 20, B: 300, C: 20 }, new Set(), new Map([['B', 1]]));
    expect(cold['B']).toBeCloseTo(300 + 2 * 0.15 * (20 - 300) + COOL * (20 - 300) + TETHER_COOL * (20 - 300), 6);
    // Three tethers count as MAX_TETHERS (2).
    const three = forward(plan, temps, new Set(['A']), new Map([['A', 3]]));
    expect(three['A']).toBeCloseTo(two['A']!, 9);
    // No map, an empty map and a zero count are all the old behaviour.
    expect(forward(plan, temps, new Set(['A']), new Map())['A']).toBeCloseTo(plain['A']!, 9);
    expect(forward(plan, temps, new Set(['A']), new Map([['A', 0]]))['A']).toBeCloseTo(plain['A']!, 9);
    // A count that is not a whole number of tethers is floored; a non-finite one counts as none.
    expect(forward(plan, temps, new Set(['A']), new Map([['A', 1.5]]))['A']).toBeCloseTo(forward(plan, temps, new Set(['A']), new Map([['A', 1]]))['A']!, 9);
    expect(forward(plan, temps, new Set(['A']), new Map([['A', Number.NaN]]))['A']).toBeCloseTo(plain['A']!, 9);
    void FLAME_TEMP; void GEN_RATE;
  });
});
