import { describe, expect, it } from 'vitest';
import { DEMO_PLAN, runLoop } from '../../loop';
import { better, containmentSeries, formatScore, onsetOf, wrongDispatchSpaces } from './metrics';

describe('containmentSeries', () => {
  it('counts spaces burning in truth per tick and grows on demo-6', () => {
    const trace = runLoop({ plan: DEMO_PLAN, seed: 42, ticks: 40 });
    const s = containmentSeries(trace);
    expect(s).toHaveLength(40);
    expect(s[0]).toBe(1);
    expect(Math.max(...s)).toBeGreaterThan(1);
    for (const v of s) expect(Number.isInteger(v) && v >= 0 && v <= 6).toBe(true);
    expect(containmentSeries([])).toEqual([]);
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
  });
  it('formats percentages and ticks', () => {
    expect(formatScore('falseCertainty', 0.654)).toBe('65%');
    expect(formatScore('timeToRecovery', 12.4)).toBe('12');
    expect(formatScore('timeToRecovery', null)).toBe('never');
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
  });
});
