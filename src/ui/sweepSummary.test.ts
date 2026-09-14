import { describe, expect, it } from 'vitest';
import summaryJson from './sweepSummary.json';
import { summarizeSweep, sweepRowsFor, type SweepRow, type SweepSummary } from './sweepSummary';
import { PLAN_NAMES } from '../shared/structures';

const row = (plan: string, brain: string, fc: number, wd: number, cov: number, ttr: number | null): SweepRow => ({ plan, brain, falseCertainty: fc, wrongDispatch: wd, ambiguityCoverage: cov, timeToRecovery: ttr });

describe('summarizeSweep', () => {
  it('means each metric per plan and brain; recovery averages only the cells that recovered', () => {
    const s = summarizeSweep([
      row('p', 'ours', 0, 0.2, 1, 10), row('p', 'ours', 0.5, 0, 0.5, null), row('p', 'kalman', 1, 1, 1, 30),
      row('q', 'ours', 0.1, 0.1, 0.1, null),
    ], { source: 'x.json', meta: { seeds: [1] } });
    expect(s.plans).toEqual(['p', 'q']);
    expect(s.brains).toEqual(['kalman', 'ours']);
    expect(s.cells['p']!['ours']).toEqual({ n: 2, falseCertainty: 0.25, wrongDispatch: 0.1, ambiguityCoverage: 0.75, timeToRecovery: 10, recovered: 0.5 });
    expect(s.cells['p']!['kalman']).toEqual({ n: 1, falseCertainty: 1, wrongDispatch: 1, ambiguityCoverage: 1, timeToRecovery: 30, recovered: 1 });
    expect(s.cells['q']!['ours']!.timeToRecovery).toBeNull();
    expect(s.cells['q']!['ours']!.recovered).toBe(0);
    expect(s.source).toBe('x.json');
    expect(s.meta).toEqual({ seeds: [1] });
  });

  it('skips rows without a plan or brain and non-numeric metrics', () => {
    const bad = [{ plan: 'p', brain: 'ours', falseCertainty: 'x', wrongDispatch: 0.5, ambiguityCoverage: 1, timeToRecovery: 4 }, { brain: 'ours' }, {}] as unknown as SweepRow[];
    const s = summarizeSweep(bad, { source: 's' });
    expect(s.plans).toEqual(['p']);
    expect(s.cells['p']!['ours']).toMatchObject({ n: 1, falseCertainty: 0, wrongDispatch: 0.5 });
    expect(summarizeSweep([], { source: 's' })).toEqual({ source: 's', meta: {}, plans: [], brains: [], cells: {} });
  });

  it('sweepRowsFor gives the four scorecard rows, or null when a brain or plan is missing', () => {
    const s = summarizeSweep([row('p', 'ours', 0, 0, 1, 5), row('p', 'kalman', 1, 1, 1, null)], { source: 's' });
    const rows = sweepRowsFor(s, 'p', 'kalman', 'ours')!;
    expect(rows.map((r) => r.key)).toEqual(['falseCertainty', 'wrongDispatch', 'ambiguityCoverage', 'timeToRecovery']);
    expect(rows[0]).toEqual({ key: 'falseCertainty', a: 1, b: 0, n: 1 });
    expect(rows[3]).toEqual({ key: 'timeToRecovery', a: null, b: 5, n: 1 });
    expect(sweepRowsFor(s, 'nope', 'kalman', 'ours')).toBeNull();
    expect(sweepRowsFor(s, 'p', 'kalman', 'gated')).toBeNull();
  });
});

describe('the committed sweep summary', () => {
  const s = summaryJson as unknown as SweepSummary;
  it('has a row for every plan file for ours and kalman, folded from the full sweep', () => {
    for (const name of PLAN_NAMES) {
      expect(s.plans, name).toContain(name);
      for (const brain of ['ours', 'kalman']) {
        const c = s.cells[name]![brain]!;
        expect(c.n).toBeGreaterThanOrEqual(100);
        for (const k of ['falseCertainty', 'wrongDispatch', 'ambiguityCoverage'] as const) expect(c[k]).toBeGreaterThanOrEqual(0);
      }
    }
    expect(s.source).toMatch(/sweep-latest\.json$/);
  });
  it('says what the sweep says: ours never has the higher false certainty on any plan', () => {
    for (const name of s.plans) expect(s.cells[name]!['ours']!.falseCertainty, name).toBeLessThanOrEqual(s.cells[name]!['kalman']!.falseCertainty);
  });
});
