/**
 * Kalman baseline tests. Observations are built by hand: the brain sees only Observation.
 */
import { describe, expect, it } from 'vitest';
import { createGatedKalmanBrain, createKalmanBrain, createSourceKalmanBrain, GATE_REACCEPT, normalCdf, SOURCE_MIN_C_PER_TICK } from './kalman';
import { forward } from './physics';
import type { Observation, Reading, StructurePlan } from '../shared/types';

const plan: StructurePlan = {
  name: 'test-3',
  ambient: 20,
  spaces: [
    { id: 'S1', level: 1 },
    { id: 'S2', level: 1 },
    { id: 'S3', level: 1 },
  ],
  edges: [
    { a: 'S1', b: 'S2', kind: 'door', rate: 0.1 },
    { a: 'S2', b: 'S3', kind: 'door', rate: 0.1 },
  ],
  sensors: [
    { id: 'F1', spaceId: 'S1' },
    { id: 'F2', spaceId: 'S2' },
    { id: 'F3', spaceId: 'S3' },
  ],
  resupply: ['S1'],
  ignition: ['S1'],
};

const reading = (sensorId: string, spaceId: string, temp: number, t: number): Reading => ({
  sensorId,
  source: 'fixed',
  spaceId,
  temp,
  t,
});

/** Clean stream: S1 steady at 450, the rest near ambient. */
const tick = (t: number): Observation => ({
  t,
  readings: [reading('F1', 'S1', 450, t), reading('F2', 'S2', 60, t), reading('F3', 'S3', 20, t)],
  drones: [],
});

describe('createKalmanBrain', () => {
  it('converges within 3C on a physics-consistent burning stream in 20 ticks, confidence > 0.9', () => {
    // The filter's process model is the world's linear heat model, so on a stream the world
    // could actually produce it tracks to within sensor noise.
    const brain = createKalmanBrain({ plan, seed: 42 });
    let temps: Record<string, number> = { S1: 450, S2: 20, S3: 20 };
    let last = brain.step(tick(1));
    let lastReadingS1 = 450;
    for (let t = 1; t <= 20; t++) {
      lastReadingS1 = temps['S1']!;
      last = brain.step({ t, readings: [reading('F1', 'S1', temps['S1']!, t), reading('F2', 'S2', temps['S2']!, t), reading('F3', 'S3', temps['S3']!, t)], drones: [] });
      temps = forward(plan, temps, new Set(['S1']));
    }
    expect(Math.abs(last.belief.estimate['S1']! - lastReadingS1)).toBeLessThan(3);
    expect(last.belief.confidence).toBeGreaterThan(0.9);
    // "Burning" to this filter is "above 200 C": by tick 20 the neighbours are hot too, and it
    // names them. Hot is not burning; the baseline cannot tell the difference. By design.
    expect(last.belief.burningSet).toContain('S1');
    // The baseline never doubts and never hedges — by design.
    expect(last.belief.ambiguous).toEqual([]);
    expect(last.belief.suspectSensors).toEqual([]);
    expect(last.commands).toEqual([]);
  });

  it('stays confident while a frozen sensor lies — the failure we exist to beat', () => {
    const brain = createKalmanBrain({ plan, seed: 42 });
    // 10 honest ticks, then F1 freezes at 450 while nothing contradicts it.
    for (let t = 1; t <= 10; t++) brain.step(tick(t));
    let last = brain.step(tick(11));
    for (let t = 12; t <= 30; t++) {
      last = brain.step({
        t,
        readings: [reading('F1', 'S1', 450, 11), reading('F2', 'S2', 60, t), reading('F3', 'S3', 20, t)],
        drones: [],
      });
    }
    // It swallowed the stale reading whole: still burning, still confident.
    expect(last.belief.burningSet).toContain('S1');
    expect(last.belief.confidence).toBeGreaterThan(0.9);
    expect(last.belief.suspectSensors).toEqual([]);
  });

  it('P(burning) is the posterior Phi((x - 200) / sd), not a hard label: graded near the threshold, saturated far from it', () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 6);
    expect(normalCdf(1.96)).toBeCloseTo(0.975, 3);
    expect(normalCdf(-3)).toBeCloseTo(0.00135, 4);
    // Isolated spaces (no edges) so nothing pushes S2 around; S2 held 1.5 C under the
    // threshold. The posterior sd settles near 1.9 C, so P(x > 200) must be graded, not 0.
    const brain = createKalmanBrain({ plan: { ...plan, edges: [] }, seed: 42 });
    let last = brain.step({ t: 1, readings: [reading('F1', 'S1', 450, 1), reading('F2', 'S2', 198.5, 1), reading('F3', 'S3', 20, 1)], drones: [] });
    for (let t = 2; t <= 20; t++) last = brain.step({ t, readings: [reading('F1', 'S1', 450, t), reading('F2', 'S2', 198.5, t), reading('F3', 'S3', 20, t)], drones: [] });
    const p = last.belief.probability!;
    expect(p['S2']!).toBeGreaterThan(0.05);
    expect(p['S2']!).toBeLessThan(0.45);
    expect(p['S1']!).toBeGreaterThan(0.99);
    expect(p['S3']!).toBeLessThan(0.01);
  });

  it('gated: a sensor frozen at the fire plateau is rejected only intermittently, never more than GATE_REACCEPT in a row, and the filter keeps believing the fire it froze on', () => {
    const brain = createGatedKalmanBrain({ plan, seed: 42 });
    let temps: Record<string, number> = { S1: 450, S2: 20, S3: 20 };
    for (let t = 1; t <= 40; t++) {
      brain.step({ t, readings: [reading('F1', 'S1', temps['S1']!, t), reading('F2', 'S2', temps['S2']!, t), reading('F3', 'S3', temps['S3']!, t)], drones: [] });
      temps = forward(plan, temps, new Set(['S1']));
    }
    const plateau = temps['S1']!;
    let rejected = 0;
    let run = 0;
    let maxRun = 0;
    let stillBurning = 0;
    for (let t = 41; t <= 60; t++) {
      // F1 freezes at the plateau value (stale timestamp) while the room drifts on slowly.
      const out = brain.step({ t, readings: [reading('F1', 'S1', plateau, 40), reading('F2', 'S2', temps['S2']!, t), reading('F3', 'S3', temps['S3']!, t)], drones: [] });
      const rej = out.belief.suspectSensors.includes('F1');
      rejected += rej ? 1 : 0;
      run = rej ? run + 1 : 0;
      maxRun = Math.max(maxRun, run);
      if (out.belief.burningSet.includes('S1')) stillBurning += 1;
      temps = forward(plan, temps, new Set(['S1']));
    }
    // The gate notices the frozen value drifting away from the model's expectation, but with
    // re-acceptance it never rejects for long, and the stale 800 C reading keeps S1 "burning"
    // regardless. Gating cannot turn a plausible stale value into a doubt about the fire.
    expect(rejected).toBeGreaterThan(0);
    expect(rejected).toBeLessThan(20);
    expect(maxRun).toBeLessThanOrEqual(GATE_REACCEPT);
    expect(stillBurning).toBe(20);
  });

  it('gated: a blinded sensor (20 C where the filter believes 450) is rejected, reported suspect, and re-accepted after GATE_REACCEPT ticks', () => {
    const brain = createGatedKalmanBrain({ plan, seed: 42 });
    for (let t = 1; t <= 10; t++) brain.step(tick(t));
    const outs = [];
    for (let t = 11; t <= 30; t++) {
      outs.push(brain.step({ t, readings: [reading('F1', 'S1', 20, t), reading('F2', 'S2', 60, t), reading('F3', 'S3', 20, t)], drones: [] }));
    }
    expect(outs[0]!.belief.suspectSensors).toContain('F1'); // a 430 C innovation fails the gate at once
    let run = 0;
    let maxRun = 0;
    for (const o of outs) {
      run = o.belief.suspectSensors.includes('F1') ? run + 1 : 0;
      maxRun = Math.max(maxRun, run);
    }
    expect(maxRun).toBe(GATE_REACCEPT); // rejected 3 in a row, then taken back in
    // Naive filter on the same stream never doubts anything.
    const naive = createKalmanBrain({ plan, seed: 42 });
    for (let t = 1; t <= 10; t++) naive.step(tick(t));
    const n = naive.step({ t: 11, readings: [reading('F1', 'S1', 20, 11), reading('F2', 'S2', 60, 11), reading('F3', 'S3', 20, 11)], drones: [] });
    expect(n.belief.suspectSensors).toEqual([]);
  });

  it('gated: ignition (a 400 C step from ambient) is still seen within GATE_REACCEPT + 1 ticks', () => {
    const brain = createGatedKalmanBrain({ plan, seed: 42 });
    const cold = (t: number): Observation => ({ t, readings: [reading('F1', 'S1', 20, t), reading('F2', 'S2', 20, t), reading('F3', 'S3', 20, t)], drones: [] });
    for (let t = 1; t <= 10; t++) brain.step(cold(t));
    let sawFire = -1;
    for (let t = 11; t <= 11 + GATE_REACCEPT + 1; t++) {
      const out = brain.step(tick(t));
      if (out.belief.burningSet.includes('S1')) { sawFire = t; break; }
    }
    expect(sawFire).toBeGreaterThan(0);
  });

  it('reset() restores the initial state deterministically', () => {
    const brain = createKalmanBrain({ plan, seed: 42 });
    const a = JSON.stringify([1, 2, 3].map((t) => brain.step(tick(t))));
    brain.reset();
    const b = JSON.stringify([1, 2, 3].map((t) => brain.step(tick(t))));
    expect(b).toBe(a);
  });

  it('skips the update on a tick with no readings without diverging covariance-confidence', () => {
    const brain = createKalmanBrain({ plan, seed: 42 });
    for (let t = 1; t <= 5; t++) brain.step(tick(t));
    const out = brain.step({ t: 6, readings: [], drones: [] });
    expect(Number.isFinite(out.belief.confidence)).toBe(true);
    expect(Object.keys(out.belief.estimate)).toHaveLength(3);
  });
});

/** A physics-consistent stream: temps advanced by forward() with the given burning set per tick. */
const streamObs = (temps: Record<string, number>, t: number): Observation => ({
  t,
  readings: [reading('F1', 'S1', temps['S1']!, t), reading('F2', 'S2', temps['S2']!, t), reading('F3', 'S3', temps['S3']!, t)],
  drones: [],
});

describe('createSourceKalmanBrain (augmented-state source filter, the fair baseline)', () => {
  it('clean burning stream: within 20 ticks names S1 burning and never names S2 or S3, even once they pass 200 C', () => {
    const brain = createSourceKalmanBrain({ plan, seed: 42 });
    const naive = createKalmanBrain({ plan, seed: 42 });
    let temps: Record<string, number> = { S1: 450, S2: 20, S3: 20 };
    let namedS1 = -1;
    let naiveNamedNeighbour = false;
    let neighbourPassed200 = false;
    for (let t = 1; t <= 20; t++) {
      const out = brain.step(streamObs(temps, t));
      const nv = naive.step(streamObs(temps, t));
      if (namedS1 < 0 && out.belief.burningSet.includes('S1')) namedS1 = t;
      expect(out.belief.burningSet).not.toContain('S2');
      expect(out.belief.burningSet).not.toContain('S3');
      if (temps['S2']! > 200 || temps['S3']! > 200) neighbourPassed200 = true;
      if (nv.belief.burningSet.includes('S2') || nv.belief.burningSet.includes('S3')) naiveNamedNeighbour = true;
      temps = forward(plan, temps, new Set(['S1']));
    }
    expect(namedS1).toBeGreaterThan(0);
    expect(namedS1).toBeLessThanOrEqual(20);
    // The stream did exercise the case: a neighbour crossed 200 C with no source of its own,
    // and the temperature-threshold filter called it burning. Hot is not burning.
    expect(neighbourPassed200).toBe(true);
    expect(naiveNamedNeighbour).toBe(true);
  });

  it('a space that goes out while still hot is dropped within 10 ticks of the source stopping; the naive filter keeps it', () => {
    const brain = createSourceKalmanBrain({ plan, seed: 42 });
    const naive = createKalmanBrain({ plan, seed: 42 });
    let temps: Record<string, number> = { S1: 450, S2: 20, S3: 20 };
    const OUT_AT = 20;
    let dropped = -1;
    let naiveKept = 0;
    for (let t = 1; t <= OUT_AT + 10; t++) {
      const out = brain.step(streamObs(temps, t));
      const nv = naive.step(streamObs(temps, t));
      if (t <= OUT_AT) expect(out.belief.burningSet).toContain('S1');
      if (t > OUT_AT && dropped < 0 && !out.belief.burningSet.includes('S1')) dropped = t;
      if (t > OUT_AT && nv.belief.burningSet.includes('S1')) naiveKept += 1;
      // S1 burns through tick OUT_AT, then its source stops; it cools but stays hot for a long time.
      temps = forward(plan, temps, new Set(t < OUT_AT ? ['S1'] : []));
    }
    expect(dropped).toBeGreaterThan(OUT_AT);
    expect(dropped).toBeLessThanOrEqual(OUT_AT + 10);
    expect(temps['S1']!).toBeGreaterThan(200); // still hot when dropped: the point of the test
    expect(naiveKept).toBe(10);
  });

  it('a sensor frozen at the fire plateau: the source filter still believes the fire (fair on clean runs, not lie-resistant)', () => {
    const brain = createSourceKalmanBrain({ plan, seed: 42 });
    let temps: Record<string, number> = { S1: 450, S2: 20, S3: 20 };
    for (let t = 1; t <= 40; t++) {
      brain.step(streamObs(temps, t));
      temps = forward(plan, temps, new Set(['S1']));
    }
    const plateau = temps['S1']!;
    let stillBurning = 0;
    for (let t = 41; t <= 60; t++) {
      const out = brain.step({ t, readings: [reading('F1', 'S1', plateau, 40), reading('F2', 'S2', temps['S2']!, t), reading('F3', 'S3', temps['S3']!, t)], drones: [] });
      if (out.belief.burningSet.includes('S1')) stillBurning += 1;
      expect(out.belief.suspectSensors).toEqual([]); // no gating in this variant
      expect(out.belief.ambiguous).toEqual([]);
      temps = forward(plan, temps, new Set(['S1']));
    }
    expect(stillBurning).toBe(20);
  });

  it('P(burning) is the posterior Phi((q - 10) / sd): in [0, 1] everywhere, > 0.99 for a strong source, < 0.01 for none', () => {
    const brain = createSourceKalmanBrain({ plan, seed: 42 });
    let temps: Record<string, number> = { S1: 450, S2: 20, S3: 20 };
    let last = brain.step(streamObs(temps, 1));
    for (let t = 1; t <= 20; t++) {
      last = brain.step(streamObs(temps, t));
      for (const id of ['S1', 'S2', 'S3']) {
        expect(last.belief.probability[id]!).toBeGreaterThanOrEqual(0);
        expect(last.belief.probability[id]!).toBeLessThanOrEqual(1);
      }
      temps = forward(plan, temps, new Set(['S1']));
    }
    expect(last.belief.probability['S1']!).toBeGreaterThan(0.99);
    expect(last.belief.probability['S2']!).toBeLessThan(0.01);
    expect(last.belief.probability['S3']!).toBeLessThan(0.01);
    expect(SOURCE_MIN_C_PER_TICK).toBe(10);
  });

  it('P(burning) is graded through normalCdf, not a hard label: a source held near the 10 C/tick line is neither 0 nor 1', () => {
    // Isolated spaces, so a space's only heat input is its own source. Hold S2 on the exact
    // trajectory of a constant source q = 10 + 1.5 C/tick against ambient cooling; the
    // posterior on q sits a fraction of a sigma above the line, so P must be in between.
    const iso = { ...plan, edges: [] };
    const brain = createSourceKalmanBrain({ plan: iso, seed: 42 });
    const q = SOURCE_MIN_C_PER_TICK + 1.5;
    let s2 = 20;
    let last = brain.step({ t: 1, readings: [reading('F1', 'S1', 20, 1), reading('F2', 'S2', s2, 1), reading('F3', 'S3', 20, 1)], drones: [] });
    for (let t = 2; t <= 40; t++) {
      s2 = s2 + 0.02 * (20 - s2) + q;
      last = brain.step({ t, readings: [reading('F1', 'S1', 20, t), reading('F2', 'S2', s2, t), reading('F3', 'S3', 20, t)], drones: [] });
    }
    const p = last.belief.probability['S2']!;
    expect(p).toBeGreaterThan(0.05);
    expect(p).toBeLessThan(0.95);
    expect(last.belief.probability['S1']!).toBeLessThan(0.01);
  });

  it('reset() restores the initial state deterministically and a tick with no readings does not break confidence', () => {
    const brain = createSourceKalmanBrain({ plan, seed: 42 });
    const a = JSON.stringify([1, 2, 3].map((t) => brain.step(tick(t))));
    brain.reset();
    const b = JSON.stringify([1, 2, 3].map((t) => brain.step(tick(t))));
    expect(b).toBe(a);
    const out = brain.step({ t: 4, readings: [], drones: [] });
    expect(Number.isFinite(out.belief.confidence)).toBe(true);
    expect(Object.keys(out.belief.estimate)).toHaveLength(3);
    expect(out.commands).toEqual([]);
  });
});
