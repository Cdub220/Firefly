/**
 * v0.2 estimator tests: predictor-corrector behavior. Observations built by hand; the
 * brain sees only Observation.
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

describe('createBrain v0.2', () => {
  it('clean readings: full confidence, correct burning set, no suspects', () => {
    const brain = createBrain({ plan, seed: 42 });
    let out = brain.step(obs(1, [reading('F1', 'S1', 450, 1), reading('F2', 'S2', 30, 1), reading('F3', 'S3', 20, 1)]));
    out = brain.step(obs(2, [reading('F1', 'S1', 455, 2), reading('F2', 'S2', 34, 2), reading('F3', 'S3', 21, 2)]));
    expect(out.belief.burningSet).toEqual(['S1']);
    expect(out.belief.suspectSensors).toEqual([]);
    expect(out.belief.confidence).toBe(1);
  });

  it('a stale sensor is excluded and the fire persists via physics prediction', () => {
    const brain = createBrain({ plan, seed: 42 });
    // Honest ticks establish S1 burning, then F1 freezes (t stops advancing).
    for (let t = 1; t <= 4; t++) {
      brain.step(
        obs(t, [reading('F1', 'S1', 450 + t, t), reading('F2', 'S2', 30 + 4 * t, t), reading('F3', 'S3', 20 + t, t)]),
      );
    }
    let out!: ReturnType<typeof brain.step>;
    for (let t = 5; t <= 10; t++) {
      out = brain.step(
        obs(t, [reading('F1', 'S1', 454, 4), reading('F2', 'S2', 30 + 4 * t, t), reading('F3', 'S3', 20 + t, t)]),
      );
    }
    expect(out.belief.suspectSensors).toEqual(['F1']);
    // The sensor died; the fire did not. Physics keeps S1 burning in the belief.
    expect(out.belief.burningSet).toContain('S1');
    expect(out.belief.estimate['S1']!).toBeGreaterThan(400);
    // One suspect costs a 0.8 factor; S1 is still backed via its S2 neighbor.
    expect(out.belief.confidence).toBeCloseTo(0.8, 5);
  });

  it('a blinded sensor (impossible one-tick drop) is excluded immediately', () => {
    const brain = createBrain({ plan, seed: 42 });
    for (let t = 1; t <= 4; t++) {
      brain.step(
        obs(t, [reading('F1', 'S1', 450 + t, t), reading('F2', 'S2', 30 + 0.3 * t, t), reading('F3', 'S3', 20, t)]),
      );
    }
    const out = brain.step(
      obs(5, [reading('F1', 'S1', 22, 5), reading('F2', 'S2', 31.5, 5), reading('F3', 'S3', 20, 5)]),
    );
    expect(out.belief.suspectSensors).toEqual(['F1']);
    expect(out.belief.burningSet).toContain('S1'); // physics says it is still burning
    expect(out.belief.confidence).toBeLessThan(0.9); // never confidently wrong here
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
    for (let t = 1; t <= 5; t++) {
      brain.step(obs(t, [droneReading('S1', 450 + t, t), reading('F2', 'S2', 30 + 0.3 * t, t)]));
    }
    // D1 relocates two doors down: an enormous drop for the sensor, but a normal move.
    const out = brain.step(obs(6, [droneReading('S3', 21, 6), reading('F2', 'S2', 32, 6)]));
    expect(out.belief.suspectSensors).toEqual([]);
  });

  it('no readings at all: zero confidence, physics carries the estimate', () => {
    const brain = createBrain({ plan, seed: 42 });
    brain.step(obs(1, [reading('F1', 'S1', 450, 1), reading('F2', 'S2', 30, 1), reading('F3', 'S3', 20, 1)]));
    const out = brain.step(obs(2, []));
    expect(out.belief.confidence).toBe(0);
    expect(out.belief.estimate['S1']!).toBeGreaterThan(400); // predicted, not forgotten
    expect(out.belief.burningSet).toContain('S1');
  });

  it('reset() clears history and estimates deterministically', () => {
    const brain = createBrain({ plan, seed: 42 });
    const run = (): string => {
      const outs = [];
      for (let t = 1; t <= 6; t++) {
        outs.push(
          brain.step(obs(t, [reading('F1', 'S1', 450, 4), reading('F2', 'S2', 30 + t, t), reading('F3', 'S3', 20, t)])),
        );
      }
      return JSON.stringify(outs);
    };
    const a = run();
    brain.reset();
    expect(run()).toBe(a);
  });
});
