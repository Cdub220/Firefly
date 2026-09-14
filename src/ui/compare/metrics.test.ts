import { describe, expect, it } from 'vitest';
import { DEMO_PLAN, runLoop, type TickRecord } from '../../loop';
import { better, containmentSeries, formatScore, missedSpaces, onsetOf, wrongDispatchSpaces } from './metrics';

describe('containmentSeries', () => {
  it('counts spaces burning in truth per tick and grows on demo-6', () => {
    const trace = runLoop({ plan: DEMO_PLAN, seed: 42, ticks: 40 });
    const s = containmentSeries(trace);
    expect(s).toHaveLength(40);
    expect(s[0]).toBe(1);
    expect(Math.max(...s)).toBeGreaterThan(1);
    for (const v of s) expect(Number.isInteger(v) && v >= 0 && v <= 6).toBe(true);
    expect(containmentSeries([])).toEqual([]);
    // Hand-built: counts exactly, ignores everything but `burning`.
    const rec = (ids: string[], burning: string[]) => ({ truth: { spaces: ids.map((id) => ({ id, burning: burning.includes(id), temp: 20 })) } }) as unknown as Pick<TickRecord, 'truth'>;
    expect(containmentSeries([rec(['a', 'b', 'c'], []), rec(['a', 'b', 'c'], ['b']), rec(['a', 'b', 'c'], ['a', 'b', 'c'])])).toEqual([0, 1, 3]);
    expect(onsetOf(trace)).toBe(0);
    expect(onsetOf(runLoop({ plan: DEMO_PLAN, seed: 1, ticks: 3, corruption: { mode: 'freeze', onset: 7 } }))).toBe(7);
    expect(onsetOf([])).toBe(0);
  });
});

describe('better', () => {
  it('lower wins for false certainty, wrong dispatch and recovery; higher wins for coverage', () => {
    expect(better('falseCertainty', 0.1, 0.6)).toBe('a');
    expect(better('falseCertainty', 0.6, 0.1)).toBe('b');
    expect(better('wrongDispatch', 0, 0.2)).toBe('a');
    expect(better('ambiguityCoverage', 0.9, 0.5)).toBe('a');
    expect(better('ambiguityCoverage', 0.5, 0.9)).toBe('b');
    expect(better('timeToRecovery', 12, 29)).toBe('a');
  });
  it('never recovering loses to any number; equal values tie', () => {
    expect(better('timeToRecovery', null, 29)).toBe('b');
    expect(better('timeToRecovery', 12, null)).toBe('a');
    expect(better('timeToRecovery', null, null)).toBe('tie');
    expect(better('falseCertainty', 0.3, 0.3)).toBe('tie');
    expect(better('ambiguityCoverage', Number.NaN, 0.5)).toBe('b');
    expect(better('ambiguityCoverage', 0.5, Number.NaN)).toBe('a');
    expect(better('falseCertainty', Number.NaN, Number.NaN)).toBe('tie');
    expect(better('falseCertainty', 0.1, Number.POSITIVE_INFINITY)).toBe('a');
    expect(better('falseCertainty', 0.30000000001, 0.3)).toBe('tie');
  });
  it('formats percentages and ticks', () => {
    expect(formatScore('falseCertainty', 0.654)).toBe('65%');
    expect(formatScore('falseCertainty', 0.655)).toBe('66%');
    expect(formatScore('falseCertainty', 0)).toBe('0%');
    expect(formatScore('falseCertainty', 1)).toBe('100%');
    expect(formatScore('ambiguityCoverage', 0.999)).toBe('100%');
    expect(formatScore('timeToRecovery', 12.4)).toBe('12');
    expect(formatScore('timeToRecovery', 12.5)).toBe('13');
    expect(formatScore('timeToRecovery', 0)).toBe('0');
    expect(formatScore('timeToRecovery', null)).toBe('never');
    expect(formatScore('wrongDispatch', null)).toBe('never');
  });
});

describe('wrongDispatchSpaces', () => {
  it('names non-burning spaces in the burning set, optionally sparing hedged ones', () => {
    const trace = runLoop({ plan: DEMO_PLAN, seed: 1, ticks: 5 });
    const rec = trace[4]!; // only S3 burns
    const belief = { burningSet: ['S3', 'S2', 'S5'], ambiguous: [['S2', 'S4']] };
    expect(wrongDispatchSpaces(rec, belief, false)).toEqual(['S2', 'S5']);
    expect(wrongDispatchSpaces(rec, belief, true)).toEqual(['S5']);
    expect(wrongDispatchSpaces(rec, { burningSet: ['S3'], ambiguous: [] }, false)).toEqual([]);
    expect(wrongDispatchSpaces(rec, { burningSet: [], ambiguous: [['S1']] }, true)).toEqual([]);
    // Several groups: every member of every group is spared, order of burningSet kept.
    const multi = { burningSet: ['S6', 'S3', 'S1', 'S4', 'S2'], ambiguous: [['S1', 'S2'], ['S4']] };
    expect(wrongDispatchSpaces(rec, multi, true)).toEqual(['S6']);
    expect(wrongDispatchSpaces(rec, multi, false)).toEqual(['S6', 'S1', 'S4', 'S2']);
    // Does not mutate the belief.
    const before = JSON.stringify(multi);
    wrongDispatchSpaces(rec, multi, true);
    expect(JSON.stringify(multi)).toBe(before);
  });
});

describe('missedSpaces', () => {
  it('names burning spaces the brain neither claims nor hedges on', () => {
    const trace = runLoop({ plan: DEMO_PLAN, seed: 1, ticks: 5 });
    const rec = trace[4]!; // only S3 burns
    expect(missedSpaces(rec, { burningSet: [], ambiguous: [] })).toEqual(['S3']);
    expect(missedSpaces(rec, { burningSet: ['S2'], ambiguous: [] })).toEqual(['S3']);
    expect(missedSpaces(rec, { burningSet: ['S3'], ambiguous: [] })).toEqual([]);
    expect(missedSpaces(rec, { burningSet: [], ambiguous: [['S3', 'S4']] })).toEqual([]); // a maybe is not a miss
    const rec2 = { truth: { spaces: [{ id: 'a', burning: true }, { id: 'b', burning: true }, { id: 'c', burning: false }] } } as unknown as Pick<TickRecord, 'truth'>;
    expect(missedSpaces(rec2, { burningSet: ['b'], ambiguous: [] })).toEqual(['a']);
    expect(missedSpaces(rec2, { burningSet: ['c'], ambiguous: [] })).toEqual(['a', 'b']);
  });
});
