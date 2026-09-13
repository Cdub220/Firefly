/**
 * Graded belief: Belief.probability, per space, from the weighted kept hypotheses; and
 * the forced-candidate rule (a trusted above-ignition reading for three ticks is burning).
 * Hand-built observations; the brain sees only Observation objects.
 */
import { describe, expect, it } from 'vitest';
import { createBrain } from './index';
import { forward, IGNITE } from './physics';
import type { Observation, Reading, SpaceId, StructurePlan } from '../shared/types';

const reading = (sensorId: string, spaceId: string, temp: number, t: number): Reading => ({
  sensorId,
  source: 'fixed',
  spaceId,
  temp,
  t,
});
const obs = (t: number, readings: Reading[]): Observation => ({ t, readings, drones: [] });

const line3: StructurePlan = {
  name: 'line-ABC',
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
  sensors: [
    { id: 'FA', spaceId: 'A' },
    { id: 'FB', spaceId: 'B' },
    { id: 'FC', spaceId: 'C' },
  ],
  resupply: ['A'],
  ignition: ['A'],
};

/** World-consistent rollout: a space at or above ignition next to a fire ignites. */
const worldStream = (plan: StructurePlan, start: Record<SpaceId, number>, burning: Set<SpaceId>, ticks: number): Record<SpaceId, number>[] => {
  let temps = start;
  const fire = new Set(burning);
  const out: Record<SpaceId, number>[] = [];
  for (let t = 0; t < ticks; t++) {
    out.push(temps);
    for (const e of plan.edges) {
      if (fire.has(e.a) && !fire.has(e.b) && temps[e.b]! >= IGNITE) fire.add(e.b);
      else if (fire.has(e.b) && !fire.has(e.a) && temps[e.a]! >= IGNITE) fire.add(e.a);
    }
    temps = forward(plan, temps, fire);
  }
  return out;
};

describe('Belief.probability', () => {
  it('(1) two equally good hypotheses {A} and {B}: both ~0.5', () => {
    // A and B each open onto C; only C has a sensor. C warms exactly as a fire in A
    // would warm it, which is exactly as a fire in B would: the data cannot tell them
    // apart, and the belief must say so with 0.5 each rather than picking one.
    const vee: StructurePlan = {
      name: 'vee',
      ambient: 20,
      spaces: [
        { id: 'A', level: 1 },
        { id: 'B', level: 1 },
        { id: 'C', level: 1 },
      ],
      edges: [
        { a: 'A', b: 'C', kind: 'door', rate: 0.15 },
        { a: 'B', b: 'C', kind: 'door', rate: 0.15 },
      ],
      sensors: [{ id: 'FC', spaceId: 'C' }],
      resupply: ['C'],
      ignition: ['A'],
    };
    const brain = createBrain({ plan: vee, seed: 42 });
    let temps: Record<SpaceId, number> = { A: 450, B: 20, C: 20 };
    let out!: ReturnType<typeof brain.step>;
    // Ticks 3-5: the symmetric window. (Later the brain's own estimate of the unsensed
    // space it currently favors breaks the symmetry; that is a separate, known effect.)
    for (let t = 1; t <= 5; t++) {
      out = brain.step(obs(t, [reading('FC', 'C', temps['C']!, t)]));
      if (t >= 3) {
        expect(out.belief.probability['A']).toBeCloseTo(0.5, 1);
        expect(out.belief.probability['B']).toBeCloseTo(0.5, 1);
        expect(out.belief.probability['A']).toBeCloseTo(out.belief.probability['B']!, 6);
      }
      temps = forward(vee, temps, new Set(['A']));
    }
    expect(out.belief.ambiguous.flat()).toEqual(expect.arrayContaining(['B']));
    expect(out.belief.confidence).toBeLessThanOrEqual(0.5);
  });

  it('(2) one hypothesis: its spaces ~1.0 before the stability cap, the others 0', () => {
    // k=0 and honest readings everywhere: nothing can be excused, so exactly one
    // explanation survives after three ticks, before stability could have been earned.
    const brain = createBrain({ plan: line3, seed: 42, k: 0 });
    const temps = worldStream(line3, { A: 450, B: 20, C: 20 }, new Set(['A']), 3);
    let out!: ReturnType<typeof brain.step>;
    for (let t = 1; t <= 3; t++) {
      const T = temps[t - 1]!;
      out = brain.step(obs(t, [reading('FA', 'A', T['A']!, t), reading('FB', 'B', T['B']!, t), reading('FC', 'C', T['C']!, t)]));
    }
    expect(out.belief.ambiguous).toEqual([]);
    expect(out.belief.probability['A']).toBeGreaterThan(0.99);
    expect(out.belief.probability['B']).toBe(0);
    expect(out.belief.probability['C']).toBe(0);
    expect(out.belief.confidence).toBeLessThanOrEqual(0.7); // stability cap still in force
  });

  it('(3) a space with a suspect sensor gets a lower probability than with a trusted one, same readings', () => {
    const temps = worldStream(line3, { A: 450, B: 20, C: 20 }, new Set(['A']), 5);
    const run = (staleA: boolean): number => {
      const brain = createBrain({ plan: line3, seed: 42 });
      let out!: ReturnType<typeof brain.step>;
      for (let t = 1; t <= 5; t++) {
        const T = temps[t - 1]!;
        // Same temperature either way; only the timestamp differs (stale => suspect).
        const fa = reading('FA', 'A', T['A']!, staleA && t >= 3 ? t - 3 : t);
        out = brain.step(obs(t, [fa, reading('FB', 'B', T['B']!, t), reading('FC', 'C', T['C']!, t)]));
      }
      if (staleA) expect(out.belief.suspectSensors).toEqual(['FA']);
      else expect(out.belief.suspectSensors).toEqual([]);
      return out.belief.probability['A']!;
    };
    const trusted = run(false);
    const suspect = run(true);
    expect(trusted).toBeGreaterThan(0.95);
    expect(suspect).toBeLessThan(trusted);
    expect(suspect).toBeGreaterThan(0); // lowered, not erased: the fire is still there
  });

  it('(4) a space reading 700C from a trusted sensor for 3 ticks is in burningSet', () => {
    // k=2 on a three-sensor plan would normally let a hypothesis discard A's witness
    // and B's; the forced rule makes that impossible once A has read hot for 3 ticks.
    const brain = createBrain({ plan: line3, seed: 42, k: 2 });
    let out!: ReturnType<typeof brain.step>;
    for (let t = 1; t <= 3; t++) {
      out = brain.step(obs(t, [reading('FA', 'A', 700, t), reading('FB', 'B', 20 + 30 * t, t), reading('FC', 'C', 20, t)]));
    }
    expect(out.belief.burningSet).toContain('A');
    expect(out.belief.probability['A']).toBe(1);
  });

  it('(5) every probability is in [0, 1], every space has one, and the values are not a distribution', () => {
    const brain = createBrain({ plan: line3, seed: 42 });
    const temps = worldStream(line3, { A: 450, B: 20, C: 20 }, new Set(['A']), 14);
    let maxSum = 0;
    for (let t = 1; t <= 14; t++) {
      const T = temps[t - 1]!;
      const { belief } = brain.step(
        obs(t, [reading('FA', 'A', T['A']!, t), reading('FB', 'B', T['B']!, t), reading('FC', 'C', T['C']!, t)]),
      );
      expect(Object.keys(belief.probability).sort()).toEqual(['A', 'B', 'C']);
      for (const p of Object.values(belief.probability)) {
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThanOrEqual(1);
      }
      maxSum = Math.max(maxSum, Object.values(belief.probability).reduce((a, b) => a + b, 0));
    }
    // By tick 14 the fire has spread to B (world-consistent stream): two spaces near 1.
    expect(maxSum).toBeGreaterThan(1.5);
  });

  it('forced rule needs a TRUSTED reading: a stale 700C reading forces nothing', () => {
    const brain = createBrain({ plan: line3, seed: 42 });
    let out!: ReturnType<typeof brain.step>;
    for (let t = 1; t <= 8; t++) {
      // C reads 700 but its timestamp never advances past 1: stale, hence suspect.
      out = brain.step(obs(t, [reading('FA', 'A', 20, t), reading('FB', 'B', 20, t), reading('FC', 'C', 700, 1)]));
    }
    expect(out.belief.suspectSensors).toEqual(['FC']);
    expect(out.belief.burningSet).not.toContain('C');
  });

  it('forced rule respects the fuel budget: a space believed burning past its fuel is no longer forced', () => {
    // Every space burns at steady state, then B runs out of fuel at tick 45 and cools by
    // physics while A and C keep burning. B still reads far above ignition (its
    // neighbors hold it near 780C), so the forced rule ALONE would keep B burning at
    // P=1 forever. The fuel budget lapses just before the burnout, scoring takes over,
    // and B becomes an honest MAYBE: kept hot by its neighbors, or still burning.
    const all = new Set(['A', 'B', 'C']);
    let temps: Record<SpaceId, number> = { A: 450, B: 450, C: 450 };
    for (let i = 0; i < 200; i++) temps = forward(line3, temps, all);
    const brain = createBrain({ plan: line3, seed: 42 });
    let out!: ReturnType<typeof brain.step>;
    for (let t = 1; t <= 60; t++) {
      out = brain.step(obs(t, [reading('FA', 'A', temps['A']!, t), reading('FB', 'B', temps['B']!, t), reading('FC', 'C', temps['C']!, t)]));
      if (t === 40) {
        expect(out.belief.burningSet).toEqual(['A', 'B', 'C']);
        expect(out.belief.confidence).toBeGreaterThan(0.9); // while fuel plausibly remains, this IS certain
      }
      if (t >= 45) temps = forward(line3, temps, new Set(['A', 'C'])); // B burned out
    }
    expect(temps['B']).toBeGreaterThan(IGNITE); // still reads hot: only the budget can release it
    // B cools exactly as a non-burning space between two fires would, so once forcing
    // lapses the physics drops it; A and C are (correctly) certain again.
    expect(out.belief.burningSet).toEqual(['A', 'C']);
    expect(out.belief.probability['B']).toBeLessThan(0.5);
    expect(out.belief.probability['A']).toBeGreaterThan(0.9);
  });
});
