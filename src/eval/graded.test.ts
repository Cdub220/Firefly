/**
 * Graded belief on the checkpoint-2 freeze run (the defect that motivated CP2 prompt 4):
 * at tick 50 of the seed-42 freeze run, truth has five spaces burning and S3 burned out
 * with its sensor frozen since tick 5. The fresh honest 800C readings at S4, S5, S6 must
 * count as burning; S3 must be a graded MAYBE. Both brains must carry `probability`.
 */
import { describe, expect, it } from 'vitest';
import { DEMO_PLAN, runLoopMulti } from '../loop';
import { createBrain } from '../brain';
import { createKalmanBrain } from '../brain/kalman';
import { computeMetrics } from './metrics';

const traces = runLoopMulti({
  plan: DEMO_PLAN,
  seed: 42,
  ticks: 60,
  corruption: { mode: 'freeze', k: 1, onset: 5, target: ['S3'], ambient: DEMO_PLAN.ambient },
  brains: { ours: createBrain, kalman: createKalmanBrain },
  primary: 'ours',
});

describe('graded belief on the freeze run', () => {
  it('tick 50: S4, S5, S6 are in burningSet and S3 is ambiguous with probability in [0.3, 0.7]', () => {
    const rec = traces['ours']![49]!;
    expect(rec.t).toBe(50);
    expect(rec.truth.spaces.filter((s) => s.burning).map((s) => s.id)).toEqual(['S1', 'S2', 'S4', 'S5', 'S6']);
    expect(rec.belief.burningSet).toEqual(expect.arrayContaining(['S4', 'S5', 'S6']));
    expect(rec.belief.ambiguous.flat()).toContain('S3');
    expect(rec.belief.probability['S3']).toBeGreaterThanOrEqual(0.3);
    expect(rec.belief.probability['S3']).toBeLessThanOrEqual(0.7);
    for (const id of ['S4', 'S5', 'S6']) expect(rec.belief.probability[id]).toBeGreaterThan(0.9);
    expect(rec.belief.confidence).toBeLessThan(0.9);
  });

  it('Kalman probability is 0 or its scalar confidence: no per-space doubt', () => {
    const rec = traces['kalman']![49]!;
    const values = new Set(Object.values(rec.belief.probability).map((p) => Math.round(p * 1000)));
    expect(values.size).toBeLessThanOrEqual(2);
    for (const p of Object.values(rec.belief.probability)) {
      expect(p === 0 || Math.abs(p - rec.belief.confidence) < 1e-9).toBe(true);
    }
    expect(Object.keys(rec.belief.probability).sort()).toEqual(DEMO_PLAN.spaces.map((s) => s.id).sort());
  });

  it('Brier score: ours is better calibrated than Kalman on this run, and ours is never false-certain', () => {
    const ours = computeMetrics(traces['ours']!, { onset: 5 });
    const kalman = computeMetrics(traces['kalman']!, { onset: 5 });
    expect(ours.brierScore).toBeLessThan(kalman.brierScore);
    expect(ours.falseCertainty).toBe(0);
    for (const m of [ours, kalman]) {
      expect(m.brierScore).toBeGreaterThanOrEqual(0);
      expect(m.brierScore).toBeLessThanOrEqual(1);
      expect(m.falsePositiveRate).toBeGreaterThanOrEqual(0);
      expect(m.falseNegativeRate).toBeLessThanOrEqual(1);
    }
    // Kalman calls S3 burning at 0.97 from tick 5 on although it burns out near tick 34:
    // a confident, wrong per-space call is what the false positive rate counts.
    expect(kalman.falsePositiveRate).toBeGreaterThan(ours.falsePositiveRate);
  });
});
