/**
 * v1 estimator tests: hypothesis-set behavior end to end. Reading streams are generated
 * by the brain's own physics (the guard pattern) so scenarios are self-consistent; the
 * brain still sees only Observation objects.
 */
import { describe, expect, it } from 'vitest';
import { createBrain } from './index';
import { forward, IGNITE } from './physics';
import type { Observation, Reading, SpaceId, StructurePlan } from '../shared/types';

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

const obs = (t: number, readings: Reading[]): Observation => ({ t, readings, drones: [] });

/**
 * Physics-consistent temp stream: S1 ignites at 450 and burns. World-consistent too: a
 * space at or above ignition with a burning neighbor ignites (the world's rule), so the
 * stream never holds a 700C space "not burning" next to a fire, which no structure does.
 */
const stream = (ticks: number): Record<SpaceId, number>[] => {
  let temps: Record<SpaceId, number> = { S1: 450, S2: 20, S3: 20 };
  const burning = new Set<SpaceId>(['S1']);
  const out: Record<SpaceId, number>[] = [];
  for (let t = 0; t < ticks; t++) {
    out.push(temps);
    for (const e of plan.edges) {
      if (burning.has(e.a) && !burning.has(e.b) && temps[e.b]! >= IGNITE) burning.add(e.b);
      else if (burning.has(e.b) && !burning.has(e.a) && temps[e.a]! >= IGNITE) burning.add(e.a);
    }
    temps = forward(plan, temps, burning);
  }
  return out;
};

describe('createBrain v1', () => {
  it('clean physics-consistent readings: correct burning set, no suspects, high confidence', () => {
    const brain = createBrain({ plan, seed: 42 });
    const temps = stream(8);
    let out!: ReturnType<typeof brain.step>;
    for (let t = 1; t <= 8; t++) {
      const T = temps[t - 1]!;
      out = brain.step(
        obs(t, [reading('F1', 'S1', T['S1']!, t), reading('F2', 'S2', T['S2']!, t), reading('F3', 'S3', T['S3']!, t)]),
      );
    }
    expect(out.belief.burningSet).toEqual(['S1']);
    expect(out.belief.suspectSensors).toEqual([]);
    expect(out.belief.confidence).toBeGreaterThan(0.9);
  });

  it('F1 freezes (stale t): suspect, and physics keeps the fire in the belief', () => {
    const brain = createBrain({ plan, seed: 42 });
    const temps = stream(12);
    let out!: ReturnType<typeof brain.step>;
    for (let t = 1; t <= 12; t++) {
      const T = temps[t - 1]!;
      const f1 = t <= 4 ? reading('F1', 'S1', T['S1']!, t) : reading('F1', 'S1', temps[3]!['S1']!, 4);
      out = brain.step(obs(t, [f1, reading('F2', 'S2', T['S2']!, t), reading('F3', 'S3', T['S3']!, t)]));
    }
    expect(out.belief.suspectSensors).toEqual(['F1']);
    // The sensor died; the fire did not. S2 ignites at tick 10 and for a few ticks the
    // rollout over-predicts it (see predict() in hypotheses.ts), so S1 is held as a
    // graded MAYBE rather than certain: still reported, still hot, never dropped.
    const reported = new Set([...out.belief.burningSet, ...out.belief.ambiguous.flat()]);
    expect(reported.has('S1')).toBe(true);
    expect(out.belief.probability['S1']!).toBeGreaterThanOrEqual(0.3);
    expect(out.belief.estimate['S1']!).toBeGreaterThan(300);
    expect(out.belief.confidence).toBeLessThan(0.9); // one distrusted sensor costs certainty
  });

  it('F1 blinded (impossible one-tick drop): suspect immediately, fire kept', () => {
    const brain = createBrain({ plan, seed: 42 });
    const temps = stream(8);
    let out!: ReturnType<typeof brain.step>;
    for (let t = 1; t <= 8; t++) {
      const T = temps[t - 1]!;
      const f1 = t < 5 ? reading('F1', 'S1', T['S1']!, t) : reading('F1', 'S1', 22, t);
      out = brain.step(obs(t, [f1, reading('F2', 'S2', T['S2']!, t), reading('F3', 'S3', T['S3']!, t)]));
      if (t === 5) expect(out.belief.suspectSensors).toEqual(['F1']); // caught on the drop tick
    }
    expect(out.belief.suspectSensors).toEqual(['F1']);
    expect(out.belief.burningSet).toContain('S1');
    expect(out.belief.confidence).toBeLessThan(0.9);
  });

  it('a drone sensor flying from a hot space to a cool one is NOT suspect', () => {
    const brain = createBrain({ plan, seed: 42 });
    const droneReading = (spaceId: string, temp: number, t: number): Reading => ({
      sensorId: 'D1:temp',
      source: 'drone',
      droneId: 'D1',
      spaceId,
      temp,
      t,
    });
    const temps = stream(7);
    for (let t = 1; t <= 6; t++) {
      const T = temps[t - 1]!;
      brain.step(obs(t, [droneReading('S1', T['S1']!, t), reading('F2', 'S2', T['S2']!, t)]));
    }
    // D1 relocates two doors down: an enormous drop for the sensor, but a normal move.
    const out = brain.step(obs(7, [droneReading('S3', temps[6]!['S3']!, 7), reading('F2', 'S2', temps[6]!['S2']!, 7)]));
    expect(out.belief.suspectSensors).toEqual([]);
  });

  it('total sensor blackout: minimal confidence, ambiguity reported, warmth not forgotten', () => {
    const brain = createBrain({ plan, seed: 42 });
    const temps = stream(4);
    for (let t = 1; t <= 4; t++) {
      const T = temps[t - 1]!;
      brain.step(
        obs(t, [reading('F1', 'S1', T['S1']!, t), reading('F2', 'S2', T['S2']!, t), reading('F3', 'S3', T['S3']!, t)]),
      );
    }
    const out = brain.step(obs(5, []));
    // Three explanations survive a blackout on this plan; 1/3 is the honest number.
    expect(out.belief.confidence).toBeLessThan(0.5);
    // With zero data every hypothesis fits; the doubt must be visible somewhere.
    const mentioned = new Set([...out.belief.burningSet, ...out.belief.ambiguous.flat()]);
    expect(mentioned.has('S1')).toBe(true);
    expect(out.belief.estimate['S1']!).toBeGreaterThan(250); // physics carries the warmth
  });

  it('an unnamed fire (all readings below 200C but misfitting) cannot get confidence 1.00', () => {
    // Butterfly: a sensed middle space between two unsensed wings; fire in a wing. The
    // middle sensor climbs while every sub-200C reading keeps "no fire" the only obvious
    // candidate — confidence must fall with the misfit, and the warm seed must
    // eventually name a wing.
    const butterfly: StructurePlan = {
      name: 'butterfly',
      ambient: 20,
      spaces: [
        { id: 'W1', level: 1 },
        { id: 'M', level: 1 },
        { id: 'W2', level: 1 },
      ],
      edges: [
        { a: 'W1', b: 'M', kind: 'door', rate: 0.1 },
        { a: 'M', b: 'W2', kind: 'door', rate: 0.1 },
      ],
      sensors: [{ id: 'FM', spaceId: 'M' }],
      resupply: ['M'],
      ignition: ['W1'],
    };
    const brain = createBrain({ plan: butterfly, seed: 42 });
    let temps: Record<SpaceId, number> = { W1: 450, M: 20, W2: 20 };
    // The whole run, not one tick: NO tick may pair a wrong burning set with conf >= 0.9.
    let wingMentioned = false;
    for (let t = 1; t <= 40; t++) {
      const out = brain.step(obs(t, [reading('FM', 'M', temps['M']!, t)]));
      const wrong = !out.belief.burningSet.includes('W1');
      if (wrong) expect(out.belief.confidence).toBeLessThan(0.9);
      const mentioned = new Set([...out.belief.burningSet, ...out.belief.ambiguous.flat()]);
      if (mentioned.has('W1') || mentioned.has('W2')) wingMentioned = true;
      temps = forward(butterfly, temps, new Set(['W1']));
    }
    expect(wingMentioned).toBe(true); // a wing is suspected at some point
  });

  it('slow-edge unsensed-space fire (rate 0.05): no wrong-set tick ever reaches conf 0.9', () => {
    // The round-4 verifier repro: with slow edges the wrong "no fire" belief is STABLE,
    // and a single well-fitting tick used to spike confidence to 1.00.
    const slow: StructurePlan = {
      name: 'butterfly-slow',
      ambient: 20,
      spaces: [
        { id: 'W1', level: 1 },
        { id: 'M', level: 1 },
        { id: 'W2', level: 1 },
      ],
      edges: [
        { a: 'W1', b: 'M', kind: 'bulkhead', rate: 0.05 },
        { a: 'M', b: 'W2', kind: 'bulkhead', rate: 0.05 },
      ],
      sensors: [{ id: 'FM', spaceId: 'M' }],
      resupply: ['M'],
      ignition: ['W1'],
    };
    const brain = createBrain({ plan: slow, seed: 42 });
    let temps: Record<SpaceId, number> = { W1: 450, M: 20, W2: 20 };
    for (let t = 1; t <= 80; t++) {
      const out = brain.step(obs(t, [reading('FM', 'M', temps['M']!, t)]));
      if (!out.belief.burningSet.includes('W1')) {
        expect(out.belief.confidence).toBeLessThan(0.9);
      }
      temps = forward(slow, temps, new Set(['W1']));
    }
  });

  it('zero readings from the first tick: confidence stays at the floor forever', () => {
    const brain = createBrain({ plan, seed: 42 });
    for (let t = 1; t <= 20; t++) {
      const out = brain.step(obs(t, []));
      expect(out.belief.confidence).toBeLessThanOrEqual(0.05);
    }
  });

  it('a NaN reading is ignored rather than poisoning every hypothesis score', () => {
    const brain = createBrain({ plan, seed: 42 });
    const out = brain.step(
      obs(1, [reading('F1', 'S1', NaN, 1), reading('F2', 'S2', 30, 1), reading('F3', 'S3', 20, 1)]),
    );
    expect(Number.isFinite(out.belief.confidence)).toBe(true);
    for (const v of Object.values(out.belief.estimate)) expect(Number.isFinite(v)).toBe(true);
  });

  it('reset() clears history and estimates deterministically', () => {
    const brain = createBrain({ plan, seed: 42 });
    const temps = stream(6);
    const run = (): string => {
      const outs = [];
      for (let t = 1; t <= 6; t++) {
        const T = temps[t - 1]!;
        outs.push(
          brain.step(
            obs(t, [reading('F1', 'S1', T['S1']!, t), reading('F2', 'S2', T['S2']!, t), reading('F3', 'S3', T['S3']!, t)]),
          ),
        );
      }
      return JSON.stringify(outs);
    };
    const a = run();
    brain.reset();
    expect(run()).toBe(a);
  });
});
