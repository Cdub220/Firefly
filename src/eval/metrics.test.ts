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
  return { t: x.t, truth, obs: { t: x.t, readings: [], drones: [] }, belief, commands: [] };
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
    const m = computeMetrics(trace, 0.9, 2);
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
    const m = computeMetrics(trace, 0.9, 5);
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
    const m = computeMetrics(trace, 0.9, 5);
    expect(m.falseCertainty).toBeCloseTo(2 / 4, 10);
    expect(m.ambiguityCoverage).toBeCloseTo(2 / 4, 10);
  });

  it('a belief without probability is scored as p = 0 everywhere', () => {
    const r = rec({ t: 5, burning: ['A'], belief: { burningSet: ['A'], confidence: 1 } });
    delete (r.belief as Partial<Belief>).probability;
    const m = computeMetrics([r], 0.9, 5);
    expect(m.brierScore).toBeCloseTo(1 / 3, 10);
    expect(m.falseNegativeRate).toBe(1);
  });
});
