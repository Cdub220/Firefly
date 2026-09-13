import { describe, expect, it } from 'vitest';
import { COOL, FLAME_TEMP, forward, GEN_RATE, maxDrop, maxRise, steadyState } from './physics';
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
});
