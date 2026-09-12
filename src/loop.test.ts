import { describe, expect, it } from 'vitest';
import { DEMO_PLAN, runLoop, runLoopMulti } from './loop';
import { createBrain } from './brain';
import { createKalmanBrain } from './brain/kalman';

describe('runLoop', () => {
  it('runs end to end and the brain sees the ignition space as burning', () => {
    const trace = runLoop({ plan: DEMO_PLAN, seed: 42, ticks: 10 });
    expect(trace).toHaveLength(10);
    const last = trace[trace.length - 1]!;
    // The fire spreads and the v0 brain thresholds on temperature, so neither set is
    // exactly the ignition set; both must still contain it.
    expect(last.truth.spaces.filter((s) => s.burning).map((s) => s.id)).toEqual(expect.arrayContaining(DEMO_PLAN.ignition));
    expect(last.belief.burningSet).toEqual(expect.arrayContaining(DEMO_PLAN.ignition));
    expect(last.obs.readings.length).toBeGreaterThan(0);
  });

  it('is deterministic: seed 42 twice gives identical traces', () => {
    const a = runLoop({ plan: DEMO_PLAN, seed: 42, ticks: 50 });
    const b = runLoop({ plan: DEMO_PLAN, seed: 42, ticks: 50 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('different seeds give different sensor noise', () => {
    const a = runLoop({ plan: DEMO_PLAN, seed: 42, ticks: 5 });
    const b = runLoop({ plan: DEMO_PLAN, seed: 43, ticks: 5 });
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });

  it('runLoopMulti feeds every brain JSON-identical observations tick for tick', () => {
    const traces = runLoopMulti({
      plan: DEMO_PLAN,
      seed: 42,
      ticks: 25,
      corruption: { mode: 'freeze', k: 1, onset: 3 },
      brains: { ours: createBrain, kalman: createKalmanBrain },
      primary: 'ours',
    });
    expect(Object.keys(traces).sort()).toEqual(['kalman', 'ours']);
    expect(traces['ours']).toHaveLength(25);
    expect(traces['kalman']).toHaveLength(25);
    for (let i = 0; i < 25; i++) {
      expect(JSON.stringify(traces['ours']![i]!.obs)).toBe(JSON.stringify(traces['kalman']![i]!.obs));
      expect(traces['ours']![i]!.t).toBe(traces['kalman']![i]!.t);
      // Distinct copies, not one shared object: a mutating brain cannot contaminate others.
      expect(traces['ours']![i]!.obs).not.toBe(traces['kalman']![i]!.obs);
    }
  });

  it('the brain never receives ground truth', () => {
    // Structural: Observation has no `spaces` field and no `burning` anywhere.
    const trace = runLoop({ plan: DEMO_PLAN, seed: 1, ticks: 3 });
    for (const rec of trace) {
      expect(Object.keys(rec.obs).sort()).toEqual(['drones', 'readings', 't']);
      expect(JSON.stringify(rec.obs)).not.toContain('burning');
    }
  });
});
