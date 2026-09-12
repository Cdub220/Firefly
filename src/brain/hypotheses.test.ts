/**
 * Hypothesis-set tests: candidate enumeration and drop-k scoring as pure functions, then
 * (below) full-estimator behavior through createBrain.
 */
import { describe, expect, it } from 'vitest';
import { candidates, hotSpaces, predict, score } from './hypotheses';
import { forward, steadyState } from './physics';
import { createBrain } from './index';
import type { Observation, Reading, SpaceId, StructurePlan } from '../shared/types';

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
  ignition: ['B'],
};

const reading = (sensorId: string, spaceId: string, temp: number, t: number): Reading => ({
  sensorId,
  source: 'fixed',
  spaceId,
  temp,
  t,
});

const ambient = (plan: StructurePlan): Record<SpaceId, number> =>
  Object.fromEntries(plan.spaces.map((s) => [s.id, plan.ambient]));

describe('candidates', () => {
  it('covers stay, grow-by-one, shrink-by-one, and trusted-hot singles, deduped', () => {
    const sets = candidates(line3, new Set(['B']), ['A']);
    const keys = sets.map((s) => [...s].sort().join(','));
    expect(keys).toContain('B'); // previous set
    expect(keys).toContain('A,B'); // grown to a neighbor (and hot-single A + neighbor B)
    expect(keys).toContain('B,C'); // grown the other way
    expect(keys).toContain(''); // shrunk: fire out
    expect(keys).toContain('A'); // trusted hot single
    expect(new Set(keys).size).toBe(keys.length); // deduped
  });

  it('caps at 64 preferring sizes near the previous set', () => {
    // A dense star plan with many neighbors explodes combinatorially; cap must hold.
    const star: StructurePlan = {
      name: 'star',
      ambient: 20,
      spaces: Array.from({ length: 30 }, (_, i) => ({ id: `S${i}`, level: 1 })),
      edges: Array.from({ length: 29 }, (_, i) => ({ a: 'S0', b: `S${i + 1}`, kind: 'door', rate: 0.02 })),
      sensors: [],
      resupply: ['S0'],
      ignition: ['S0'],
    };
    const sets = candidates(star, new Set(['S0']), Array.from({ length: 29 }, (_, i) => `S${i + 1}`));
    expect(sets.length).toBeLessThanOrEqual(64);
    expect(sets.map((s) => [...s].sort().join(','))).toContain('S0');
  });
});

describe('score', () => {
  it('prefers the true burning set when readings come from its own steady state', () => {
    const steady = steadyState(line3, new Set(['B']));
    const trusted = [
      reading('FA', 'A', steady['A']!, 10),
      reading('FB', 'B', steady['B']!, 10),
      reading('FC', 'C', steady['C']!, 10),
    ];
    const prev = steady; // settled belief
    const sB = score(line3, new Set(['B']), trusted, prev, 0);
    const sA = score(line3, new Set(['A']), trusted, prev, 0);
    const sNone = score(line3, new Set(), trusted, prev, 0);
    expect(sB.s).toBeLessThan(sA.s);
    expect(sB.s).toBeLessThan(sNone.s);
  });

  it('drop-k makes the score robust to k lying sensors', () => {
    const steady = steadyState(line3, new Set(['B']));
    const trusted = [
      reading('FA', 'A', steady['A']!, 10),
      reading('FB', 'B', 22, 10), // an undetected liar at the fire
      reading('FC', 'C', steady['C']!, 10),
    ];
    const withTolerance = score(line3, new Set(['B']), trusted, steady, 1);
    const withoutTolerance = score(line3, new Set(['B']), trusted, steady, 0);
    expect(withTolerance.s).toBeLessThan(withoutTolerance.s);
    // With the liar dropped, the true hypothesis still beats "no fire".
    expect(withTolerance.s).toBeLessThan(score(line3, new Set(), trusted, steady, 1).s);
  });

  it('never drops every residual: k >= readings leaves at least one', () => {
    const trusted = [reading('FA', 'A', 400, 5)];
    const s = score(line3, new Set(), trusted, ambient(line3), 5);
    expect(s.s).toBeGreaterThan(0); // the single (worst) residual survives
  });
});

describe('estimator with hypothesis sets (A-B-C line, fire in B)', () => {
  const steady = steadyState(line3, new Set(['B']));
  const obs = (t: number, readings: Reading[]): Observation => ({ t, readings, drones: [] });

  it("B's sensor flashed over: burningSet still contains B, confidence < 1 on symmetric readings", () => {
    const brain = createBrain({ plan: line3, seed: 42 }); // default k=2: 2 sensors may lie
    let out!: ReturnType<typeof brain.step>;
    for (let t = 1; t <= 6; t++) {
      // Only A and C report, symmetrically; B is silent (flashed over).
      out = brain.step(obs(t, [reading('FA', 'A', steady['A']!, t), reading('FC', 'C', steady['A']!, t)]));
    }
    expect(out.belief.burningSet).toContain('B');
    expect(out.belief.confidence).toBeLessThan(1);
    expect(out.belief.ambiguous.length).toBeGreaterThan(0); // the doubt is visible, not hidden
  });

  it('a trusted 450C reading at B collapses the set to one hypothesis, confidence > 0.9', () => {
    // k=0: all three sensors trusted to be honest, so the data can fully separate.
    const brain = createBrain({ plan: line3, seed: 42, k: 0 });
    let out!: ReturnType<typeof brain.step>;
    for (let t = 1; t <= 6; t++) {
      out = brain.step(
        obs(t, [
          reading('FA', 'A', steady['A']!, t),
          reading('FB', 'B', steady['B']!, t),
          reading('FC', 'C', steady['C']!, t),
        ]),
      );
    }
    expect(out.belief.burningSet).toEqual(['B']);
    expect(out.belief.ambiguous).toEqual([]);
    expect(out.belief.confidence).toBeGreaterThan(0.9);
  });

  it('B frozen at 22 while A and C rise: B suspect, and physics puts B back in burningSet within 10 ticks', () => {
    const brain = createBrain({ plan: line3, seed: 42 });
    // Physics-consistent world: B ignites and burns; its sensor lies flat at ambient.
    let temps: Record<SpaceId, number> = { A: 20, B: 450, C: 20 };
    let out!: ReturnType<typeof brain.step>;
    for (let t = 1; t <= 10; t++) {
      out = brain.step(
        obs(t, [
          reading('FA', 'A', temps['A']!, t),
          reading('FB', 'B', 22, t), // frozen at ambient, current timestamp
          reading('FC', 'C', temps['C']!, t),
        ]),
      );
      temps = forward(line3, temps, new Set(['B']));
    }
    expect(out.belief.suspectSensors).toEqual(['FB']);
    expect(out.belief.burningSet).toContain('B');
  });

  it('performance: a step on the 6-space demo plan stays under 5ms', () => {
    const demo: StructurePlan = {
      ...line3,
      name: 'perf-6',
      spaces: Array.from({ length: 6 }, (_, i) => ({ id: `S${i + 1}`, level: 1 })),
      edges: Array.from({ length: 5 }, (_, i) => ({ a: `S${i + 1}`, b: `S${i + 2}`, kind: 'door', rate: 0.15 })),
      sensors: Array.from({ length: 6 }, (_, i) => ({ id: `F${i + 1}`, spaceId: `S${i + 1}` })),
      ignition: ['S3'],
    };
    const brain = createBrain({ plan: demo, seed: 42 });
    const start = performance.now();
    const TICKS = 60;
    for (let t = 1; t <= TICKS; t++) {
      brain.step(
        obs(
          t,
          demo.spaces.map((s, i) => reading(`F${i + 1}`, s.id, 20 + ((t * 31 + i * 17) % 400), t)),
        ),
      );
    }
    const msPerStep = (performance.now() - start) / TICKS;
    expect(msPerStep).toBeLessThan(5);
  });
});

describe('predict / hotSpaces', () => {
  it('predict blends steady state with one forward step', () => {
    const prev = ambient(line3);
    const p = predict(line3, new Set(['B']), prev);
    const steady = steadyState(line3, new Set(['B']));
    expect(p['B']!).toBeGreaterThan(prev['B']!);
    expect(p['B']!).toBeLessThan(steady['B']!); // early prediction under-runs steady state
  });

  it('hotSpaces lists spaces with a >200C trusted reading, deduped', () => {
    expect(
      hotSpaces([reading('FA', 'A', 450, 1), reading('FA2', 'A', 460, 1), reading('FB', 'B', 30, 1)]),
    ).toEqual(['A']);
  });
});
