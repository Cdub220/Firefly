import { describe, expect, it } from 'vitest';
import { DEMO_PLAN, runLoop } from '../../loop';
import type { Belief } from '../../shared/types';
import { beliefFrame, DIFF_COLORS, diffClass, diffFrame, frameFor, isDoorOpen, LYING_THRESHOLD_C, truthFrame, unsensedSpaces } from './frame';

describe('truthFrame', () => {
  it('carries temps, burning, doors and marks every present fixed sensor ok on a clean run', () => {
    const trace = runLoop({ plan: DEMO_PLAN, seed: 1, ticks: 5 });
    const f = truthFrame(trace[4]!, DEMO_PLAN);
    expect(Object.keys(f.temps).sort()).toEqual(DEMO_PLAN.spaces.map((s) => s.id).sort());
    expect(f.burning['S3']).toBe(true);
    expect(isDoorOpen(f, 'S1', 'S2')).toBe(true);
    for (const s of DEMO_PLAN.sensors) expect(f.sensors[s.id]).toBe('ok');
  });

  it('a door is open if either side lists the other, closed only when neither does', () => {
    const base = { temps: {}, burning: {}, sensors: {} };
    expect(isDoorOpen({ ...base, doorsOpen: { A: ['B'], B: [] } }, 'A', 'B')).toBe(true);
    expect(isDoorOpen({ ...base, doorsOpen: { A: [], B: ['A'] } }, 'A', 'B')).toBe(true);
    expect(isDoorOpen({ ...base, doorsOpen: { A: [], B: [] } }, 'A', 'B')).toBe(false);
    expect(isDoorOpen({ ...base, doorsOpen: {} }, 'A', 'B')).toBe(false);
  });

  it('marks a frozen sensor lying once its stale value drifts, and a missing sensor dead', () => {
    const trace = runLoop({ plan: DEMO_PLAN, seed: 1, ticks: 40, corruption: { mode: 'freeze', k: 1, onset: 3, target: ['S3'] } });
    const late = truthFrame(trace[39]!, DEMO_PLAN);
    const s3 = DEMO_PLAN.sensors.find((s) => s.spaceId === 'S3')!;
    const reading = trace[39]!.obs.readings.find((r) => r.sensorId === s3.id)!;
    const truth = trace[39]!.truth.spaces.find((s) => s.id === 'S3')!;
    expect(Math.abs(reading.temp - truth.temp)).toBeGreaterThan(LYING_THRESHOLD_C);
    expect(late.sensors[s3.id]).toBe('lying');

    const rec = trace[39]!;
    const dropped = { ...rec, obs: { ...rec.obs, readings: rec.obs.readings.filter((r) => r.sensorId !== s3.id) } };
    expect(truthFrame(dropped, DEMO_PLAN).sensors[s3.id]).toBe('dead');
  });
});

const ids = DEMO_PLAN.spaces.map((s) => s.id);
const belief = (over: Partial<Belief>): Belief => ({
  estimate: Object.fromEntries(ids.map((id) => [id, 22])),
  burningSet: [],
  ambiguous: [],
  suspectSensors: [],
  confidence: 0.5,
  probability: Object.fromEntries(ids.map((id) => [id, 0])),
  ...over,
});

describe('diffClass', () => {
  const est = { S1: 22, S2: 100, S3: 500, S4: 22 };
  const truth = { S1: 22, S2: 150, S3: 400, S4: 22 };
  it('grades by error and by burning-set disagreement', () => {
    expect(diffClass(est, truth, [], [], 'S1')).toBe('ok');            // 0 C
    expect(diffClass(est, truth, [], [], 'S2')).toBe('warn');          // 50 C
    expect(diffClass(est, truth, [], [], 'S3')).toBe('wrong');         // 100 C
    expect(diffClass(est, truth, ['S1'], [], 'S1', false)).toBe('wrong');       // believed burning, is not
    expect(diffClass(est, truth, [], [], 'S1', true)).toBe('wrong');            // burning, not believed
    expect(diffClass(est, truth, ['S1'], [['S1', 'S4']], 'S1', false)).toBe('uncertain'); // disagreement inside a group
    expect(diffClass(est, truth, ['S1'], [['S1', 'S4']], 'S1', true)).toBe('ok');         // agreement inside a group, 0 C
    expect(diffClass(est, truth, [], [], 'S9')).toBe('wrong');         // unknown space: no estimate
    expect(diffClass(est, truth, [], [['S9']], 'S9')).toBe('uncertain');
  });
  it('thresholds are inclusive at 20 and 80', () => {
    expect(diffClass({ A: 20 }, { A: 0 }, [], [], 'A')).toBe('warn');
    expect(diffClass({ A: 19.99 }, { A: 0 }, [], [], 'A')).toBe('ok');
    expect(diffClass({ A: 80 }, { A: 0 }, [], [], 'A')).toBe('wrong');
    expect(diffClass({ A: 79.99 }, { A: 0 }, [], [], 'A')).toBe('warn');
  });
});

describe('beliefFrame and diffFrame', () => {
  const trace = runLoop({ plan: DEMO_PLAN, seed: 1, ticks: 20 });
  const rec = trace[19]!;
  const truthTemps = Object.fromEntries(rec.truth.spaces.map((s) => [s.id, s.temp]));

  it('beliefFrame colors by the estimate, pulses the burning set, carries groups, suspects and unsensed spaces', () => {
    const b = belief({ estimate: { ...truthTemps, S5: 999 }, burningSet: ['S3'], ambiguous: [['S2', 'S4'], []], suspectSensors: ['F2'] });
    const f = beliefFrame(rec, DEMO_PLAN, b);
    expect(f.temps['S5']).toBe(999);
    expect(f.burning['S3']).toBe(true);
    expect(f.burning['S2']).toBe(false);
    expect(f.groups).toEqual([['S2', 'S4']]); // empty group dropped
    expect(f.suspect).toEqual(['F2']);
    expect(f.unsensed).toEqual([]); // every demo-6 space has a sensor and readings
    const deaf = { ...rec, obs: { ...rec.obs, readings: rec.obs.readings.filter((r) => r.spaceId !== 'S6') } };
    expect(unsensedSpaces(deaf, DEMO_PLAN)).toEqual(['S6']);
    expect(beliefFrame(deaf, DEMO_PLAN, b).unsensed).toEqual(['S6']);
    expect(f.doorsOpen).toEqual(truthFrame(rec, DEMO_PLAN).doorsOpen); // doors are structure, from truth
  });

  it('diffFrame colors by error class and outlines disagreements, amber inside a group', () => {
    const truthBurning = rec.truth.spaces.filter((s) => s.burning).map((s) => s.id);
    const b = belief({ estimate: { ...truthTemps, S1: truthTemps['S1']! + 50, S6: truthTemps['S6']! + 200 }, burningSet: truthBurning.filter((id) => id !== 'S3'), ambiguous: [['S3', 'S2']] });
    const f = diffFrame(rec, DEMO_PLAN, b);
    expect(f.colors!['S1']).toBe(DIFF_COLORS.warn);
    expect(f.colors!['S6']).toBe(DIFF_COLORS.wrong);
    expect(f.outline!['S6']).toBeUndefined(); // temperature wrong but burning verdict agrees: no outline
    expect(f.outline!['S3']).toBe('uncertain'); // burning in truth, not believed, inside a group
    expect(f.temps['S1']).toBeCloseTo(50, 6);
    const b2 = belief({ estimate: truthTemps, burningSet: [], ambiguous: [] });
    expect(diffFrame(rec, DEMO_PLAN, b2).outline!['S3']).toBe('wrong'); // same disagreement outside any group
    expect(Object.values(f.burning)).toEqual([]); // diff view never pulses
  });

  it('frameFor dispatches and falls back to truth without a belief', () => {
    expect(frameFor('truth', rec, DEMO_PLAN, undefined)).toEqual(truthFrame(rec, DEMO_PLAN));
    expect(frameFor('belief', rec, DEMO_PLAN, undefined)).toEqual(truthFrame(rec, DEMO_PLAN));
    const b = belief({});
    expect(frameFor('belief', rec, DEMO_PLAN, b).groups).toEqual([]);
    expect(frameFor('diff', rec, DEMO_PLAN, b).colors).toBeDefined();
  });
});
