/**
 * computeMetrics on synthetic traces where the answers are known by hand.
 */
import { describe, expect, it } from 'vitest';
import { computeMetrics } from './metrics';
import type { TickRecord } from '../loop';
import type { Belief, SpaceId } from '../shared/types';

const IDS: SpaceId[] = ['A', 'B', 'C'];

type Tick = {
  t: number;
  burning: SpaceId[];
  temps?: Record<SpaceId, number>;
  belief: Partial<Belief> & { burningSet: SpaceId[]; confidence: number };
  stepMs?: number;
};

/** Build a TickRecord with only the fields the metrics read; everything else is filler. */
function rec(x: Tick): TickRecord {
  const temps = x.temps ?? { A: 22, B: 22, C: 22 };
  const truth = {
    t: x.t,
    spaces: IDS.map((id) => ({
      id, level: 1, neighbors: [], above: null, below: null, temp: temps[id]!, burning: x.burning.includes(id),
      fuel: 1, hazard: 'none' as const, occupants: 0, doorsOpen: [],
    })),
    drones: [],
  };
  const belief: Belief = {
    estimate: x.belief.estimate ?? temps,
    burningSet: x.belief.burningSet,
    ambiguous: x.belief.ambiguous ?? [],
    suspectSensors: x.belief.suspectSensors ?? [],
    confidence: x.belief.confidence,
    probability: x.belief.probability ?? Object.fromEntries(IDS.map((id) => [id, x.belief.burningSet.includes(id) ? 1 : 0])),
  };
  return { t: x.t, truth, obs: { t: x.t, readings: [], drones: [] }, belief, commands: [], stepMs: x.stepMs ?? 0, onset: null };
}

describe('computeMetrics', () => {
  it('brierScore is the mean SQUARED error of probability against truth, over ticks >= onset', () => {
    // Tick 1 is before onset and must not count. Ticks 2-3: A burns; p(A)=0.5 -> 0.25
    // each; B, C cold at p=0 -> 0. Mean over 6 space-ticks = 0.5/6.
    const trace = [
      rec({ t: 1, burning: ['A'], belief: { burningSet: [], confidence: 0.2, probability: { A: 1, B: 1, C: 1 } } }),
      rec({ t: 2, burning: ['A'], belief: { burningSet: ['A'], confidence: 0.5, probability: { A: 0.5, B: 0, C: 0 } } }),
      rec({ t: 3, burning: ['A'], belief: { burningSet: ['A'], confidence: 0.5, probability: { A: 0.5, B: 0, C: 0 } } }),
    ];
    const m = computeMetrics(trace, { onset: 2 });
    expect(m.brierScore).toBeCloseTo(0.5 / 6, 10); // absolute error would give 1.0 / 6
    expect(m.falsePositiveRate).toBe(0);
    expect(m.falseNegativeRate).toBe(0); // p(A)=0.5 counts as "called burning" at the inclusive 0.5 threshold
  });

  it('falsePositiveRate / falseNegativeRate use the 0.5 decision threshold inclusively', () => {
    const trace = [
      // A burns, called at exactly 0.5: a positive (not a false negative).
      // B cold, called at 0.5: a false positive. C cold at 0.49: fine.
      rec({ t: 5, burning: ['A'], belief: { burningSet: ['A'], confidence: 0.5, probability: { A: 0.5, B: 0.5, C: 0.49 } } }),
      // A burns at 0.2: a false negative. B, C cold at 0.
      rec({ t: 6, burning: ['A'], belief: { burningSet: [], confidence: 0.3, probability: { A: 0.2, B: 0, C: 0 } } }),
    ];
    const m = computeMetrics(trace, { onset: 5 });
    expect(m.falsePositiveRate).toBeCloseTo(1 / 4, 10);
    expect(m.falseNegativeRate).toBeCloseTo(1 / 2, 10);
  });

  it('falseCertainty counts only confident wrong sets after onset; coverage counts truth inside set + ambiguous', () => {
    const trace = [
      rec({ t: 1, burning: ['A'], belief: { burningSet: ['B'], confidence: 0.99 } }), // before onset: ignored
      rec({ t: 5, burning: ['A'], belief: { burningSet: ['B'], confidence: 0.99 } }), // false certain, not covered
      rec({ t: 6, burning: ['A'], belief: { burningSet: ['B'], confidence: 0.5, ambiguous: [['A']] } }), // honest, covered
      rec({ t: 7, burning: ['A'], belief: { burningSet: ['A'], confidence: 0.99 } }), // right
      rec({ t: 8, burning: ['A', 'B'], belief: { burningSet: ['A'], confidence: 0.95 } }), // false certain, not covered
    ];
    const m = computeMetrics(trace, { onset: 5 });
    expect(m.falseCertainty).toBeCloseTo(2 / 4, 10);
    expect(m.ambiguityCoverage).toBeCloseTo(2 / 4, 10);
  });

  it('a belief without probability is scored as p = 0 everywhere', () => {
    const r = rec({ t: 5, burning: ['A'], belief: { burningSet: ['A'], confidence: 1 } });
    delete (r.belief as Partial<Belief>).probability;
    const m = computeMetrics([r], { onset: 5 });
    expect(m.brierScore).toBeCloseTo(1 / 3, 10);
    expect(m.falseNegativeRate).toBe(1);
  });

  it('estimationError is windowed to ticks >= onset', () => {
    const trace = [
      rec({ t: 1, burning: [], temps: { A: 100, B: 22, C: 22 }, belief: { burningSet: [], confidence: 0.5, estimate: { A: 0, B: 22, C: 22 } } }), // 100/3 error, before onset
      rec({ t: 2, burning: [], temps: { A: 22, B: 22, C: 22 }, belief: { burningSet: [], confidence: 0.5, estimate: { A: 25, B: 22, C: 22 } } }), // 1 C mean
    ];
    expect(computeMetrics(trace, { onset: 2 }).estimationError).toBeCloseTo(1, 10);
    expect(computeMetrics(trace, { onset: 0 }).estimationError).toBeCloseTo((100 + 3) / 6, 10);
  });

  it('timeToRecovery: ticks from onset to the first of 5 consecutive exact matches; null if never', () => {
    const mk = (t: number, ok: boolean) => rec({ t, burning: ['A'], belief: { burningSet: ok ? ['A'] : ['B'], confidence: 0.5 } });
    // Onset 5. Matches at 6,7 (broken at 8), then 9..13 exact: recovery at tick 9 -> 4.
    const trace = [mk(5, false), mk(6, true), mk(7, true), mk(8, false), mk(9, true), mk(10, true), mk(11, true), mk(12, true), mk(13, true), mk(14, false)];
    expect(computeMetrics(trace, { onset: 5 }).timeToRecovery).toBe(4);
    // Only four in a row: never.
    expect(computeMetrics(trace.slice(0, 8), { onset: 5 }).timeToRecovery).toBeNull();
    // Exact from the onset tick itself: 0.
    expect(computeMetrics([mk(5, true), mk(6, true), mk(7, true), mk(8, true), mk(9, true)], { onset: 5 }).timeToRecovery).toBe(0);
    // Matches before onset do not count.
    expect(computeMetrics([mk(1, true), mk(2, true), mk(3, true), mk(4, true), mk(5, true), mk(6, false)], { onset: 5 }).timeToRecovery).toBeNull();
  });

  it('computeMsPerTick is the mean stepMs over the whole trace', () => {
    const trace = [
      rec({ t: 1, burning: [], belief: { burningSet: [], confidence: 0.5 }, stepMs: 1 }),
      rec({ t: 2, burning: [], belief: { burningSet: [], confidence: 0.5 }, stepMs: 3 }),
    ];
    expect(computeMetrics(trace, { onset: 2 }).computeMsPerTick).toBe(2);
    expect(computeMetrics([], { onset: 0 }).computeMsPerTick).toBe(0);
  });

  it('wrongDispatch counts a believed space that is neither burning in truth nor hedged as ambiguous', () => {
    const trace = [
      rec({ t: 5, burning: ['A'], belief: { burningSet: ['A', 'B'], confidence: 0.5 } }), // B wrong, unhedged
      rec({ t: 6, burning: ['A'], belief: { burningSet: ['A', 'B'], confidence: 0.5, ambiguous: [['B']] } }), // B hedged: not a dispatch error
      rec({ t: 7, burning: ['A'], belief: { burningSet: ['B'], confidence: 0.5 } }), // wrong and missed
      rec({ t: 8, burning: ['A'], belief: { burningSet: [], confidence: 0.2, ambiguous: [['A']] } }), // missed but no wrong dispatch
    ];
    const m = computeMetrics(trace, { onset: 5 });
    expect(m.wrongDispatch).toBeCloseTo(2 / 4, 10);
    expect(m.ambiguityCoverage).toBeCloseTo(3 / 4, 10);
  });

  it('sets are compared as sorted id lists: order does not matter, a duplicate id does', () => {
    const same = rec({ t: 5, burning: ['A', 'B'], belief: { burningSet: ['B', 'A'], confidence: 0.99 } });
    expect(computeMetrics([same], { onset: 5 }).falseCertainty).toBe(0);
    const dup = rec({ t: 5, burning: ['A'], belief: { burningSet: ['A', 'A'], confidence: 0.99 } });
    expect(computeMetrics([dup], { onset: 5 }).falseCertainty).toBe(1);
  });

  it('confidenceThreshold is an option (default 0.9)', () => {
    const trace = [rec({ t: 5, burning: ['A'], belief: { burningSet: ['B'], confidence: 0.8 } })];
    expect(computeMetrics(trace, { onset: 5 }).falseCertainty).toBe(0);
    expect(computeMetrics(trace, { onset: 5, confidenceThreshold: 0.7 }).falseCertainty).toBe(1);
  });

  it('the loop records stepMs and onset on every tick, and the metrics read them', async () => {
    const { DEMO_PLAN, runLoop, runLoopMulti, onsetOf } = await import('../loop');
    const { createBrain } = await import('../brain');
    const clean = runLoop({ plan: DEMO_PLAN, seed: 1, ticks: 5 });
    for (const r of clean) {
      expect(r.stepMs).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(r.stepMs)).toBe(true);
      expect(r.onset).toBeNull();
    }
    const multi = runLoopMulti({ plan: DEMO_PLAN, seed: 1, ticks: 5, corruption: { mode: 'freeze', k: 1 }, brains: { ours: createBrain } });
    for (const r of multi['ours']!) expect(r.onset).toBe(5); // default onset
    expect(onsetOf({ mode: 'blind', onset: 9 })).toBe(9);
    expect(onsetOf({ mode: 'none', onset: 9 })).toBeNull();
    expect(onsetOf(undefined)).toBeNull();
    const m = computeMetrics(multi['ours']!, { onset: 5 });
    expect(m.computeMsPerTick).toBeGreaterThan(0);
  });
});
