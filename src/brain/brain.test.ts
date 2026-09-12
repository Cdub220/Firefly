/**
 * v0.1 estimator honesty tests. Observations built by hand; the brain sees only
 * Observation.
 */
import { describe, expect, it } from 'vitest';
import { createBrain } from './index';
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

const obs = (t: number, readings: Reading[]): Observation => ({ t, readings, drones: [] });

describe('createBrain v0.1', () => {
  it('clean readings: full confidence, correct burning set, no suspects', () => {
    const brain = createBrain({ plan, seed: 42 });
    let out = brain.step(obs(1, [reading('F1', 'S1', 450, 1), reading('F2', 'S2', 30, 1), reading('F3', 'S3', 20, 1)]));
    out = brain.step(obs(2, [reading('F1', 'S1', 451, 2), reading('F2', 'S2', 31, 2), reading('F3', 'S3', 21, 2)]));
    expect(out.belief.burningSet).toEqual(['S1']);
    expect(out.belief.suspectSensors).toEqual([]);
    expect(out.belief.confidence).toBe(1);
  });

  it('a stale reading (t lagging obs.t by >3) is suspect and excluded from the estimate', () => {
    const brain = createBrain({ plan, seed: 42 });
    // F1 froze at tick 2 (t stuck), the others stay live.
    for (let t = 1; t <= 10; t++) {
      brain.step(
        obs(t, [
          reading('F1', 'S1', 450, Math.min(t, 2)),
          reading('F2', 'S2', 30 + t, t),
          reading('F3', 'S3', 20 + t, t),
        ]),
      );
    }
    const out = brain.step(
      obs(11, [reading('F1', 'S1', 450, 2), reading('F2', 'S2', 41, 11), reading('F3', 'S3', 31, 11)]),
    );
    expect(out.belief.suspectSensors).toEqual(['F1']);
    // Never full confidence while distrusting a sensor.
    expect(out.belief.confidence).toBeLessThan(1);
    expect(out.belief.confidence).toBeCloseTo(2 / 3, 5);
    // S1 estimate comes from its trusted neighbor S2, not the frozen 450.
    expect(out.belief.estimate['S1']).toBeCloseTo(41, 5);
    expect(out.belief.burningSet).toEqual([]);
  });

  it('a current-looking sensor stuck for 8 ticks while a neighbor moves >20C is suspect', () => {
    const brain = createBrain({ plan, seed: 42 });
    // F2 pins at exactly 100 with a CURRENT t; its neighbor S1 climbs 15C/tick.
    let out = brain.step(obs(1, [reading('F1', 'S1', 100, 1), reading('F2', 'S2', 100, 1), reading('F3', 'S3', 20, 1)]));
    for (let t = 2; t <= 12; t++) {
      out = brain.step(
        obs(t, [reading('F1', 'S1', 100 + 15 * t, t), reading('F2', 'S2', 100, t), reading('F3', 'S3', 20, t)]),
      );
    }
    expect(out.belief.suspectSensors).toEqual(['F2']);
    expect(out.belief.confidence).toBeLessThan(1);
  });

  it('an implausible one-tick drop (blinded sensor) is suspect from the drop onward', () => {
    const brain = createBrain({ plan, seed: 42 });
    // F1 reads a real 450C fire, then smoke blinds it: it reports ambient with a
    // CURRENT timestamp and keeps jittering, so neither the stale nor the stuck rule
    // ever fires. The 428C one-tick drop is the tell.
    for (let t = 1; t <= 4; t++) {
      brain.step(obs(t, [reading('F1', 'S1', 450, t), reading('F2', 'S2', 30, t), reading('F3', 'S3', 20, t)]));
    }
    let out = brain.step(obs(5, [reading('F1', 'S1', 22, 5), reading('F2', 'S2', 30, 5), reading('F3', 'S3', 20, 5)]));
    expect(out.belief.suspectSensors).toEqual(['F1']);
    // Honest sensors jitter past the 0.1C change epsilon, as real (noisy) sensors do.
    for (let t = 6; t <= 12; t++) {
      out = brain.step(
        obs(t, [
          reading('F1', 'S1', 22 + (t % 2), t),
          reading('F2', 'S2', 30 + 0.2 * (t % 2), t),
          reading('F3', 'S3', 20 + 0.2 * (t % 2), t),
        ]),
      );
    }
    expect(out.belief.suspectSensors).toEqual(['F1']); // distrust persists
    expect(out.belief.confidence).toBeLessThan(0.9); // never confidently wrong again
  });

  it('halves confidence when a believed-burning space has no trusted reading', () => {
    const brain = createBrain({ plan, seed: 42 });
    // S2 has no sensor reading at all; its neighbors S1 and S3 read 450 -> S2 estimated
    // burning purely by neighbor inference.
    const out = brain.step(obs(1, [reading('F1', 'S1', 450, 1), reading('F3', 'S3', 450, 1)]));
    expect(out.belief.burningSet).toContain('S2');
    expect(out.belief.confidence).toBeCloseTo(0.5, 5); // 2/2 trusted, halved for the blind spot
  });

  it('no readings at all: zero confidence, ambient estimates', () => {
    const brain = createBrain({ plan, seed: 42 });
    const out = brain.step(obs(1, []));
    expect(out.belief.confidence).toBe(0);
    expect(out.belief.estimate).toEqual({ S1: 20, S2: 20, S3: 20 });
    expect(out.belief.burningSet).toEqual([]);
  });

  it('reset() clears sensor memory', () => {
    const brain = createBrain({ plan, seed: 42 });
    const run = (): string => {
      const outs = [];
      for (let t = 1; t <= 6; t++) {
        outs.push(brain.step(obs(t, [reading('F1', 'S1', 450, 1), reading('F2', 'S2', 30, t), reading('F3', 'S3', 20, t)])));
      }
      return JSON.stringify(outs);
    };
    const a = run();
    brain.reset();
    expect(run()).toBe(a);
  });
});
