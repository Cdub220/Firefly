/**
 * Kalman baseline tests. Observations are built by hand: the brain sees only Observation.
 */
import { describe, expect, it } from 'vitest';
import { createKalmanBrain } from './kalman';
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
  it('converges within 3C on a clean single-hot-space stream in 20 ticks, confidence > 0.9', () => {
    const brain = createKalmanBrain({ plan, seed: 42 });
    let last = brain.step(tick(1));
    for (let t = 2; t <= 20; t++) last = brain.step(tick(t));
    expect(Math.abs(last.belief.estimate['S1']! - 450)).toBeLessThan(3);
    expect(last.belief.confidence).toBeGreaterThan(0.9);
    expect(last.belief.burningSet).toEqual(['S1']);
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
