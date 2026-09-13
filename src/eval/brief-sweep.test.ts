/**
 * The brief sweep: flag parsing, means with "never" handling, and a tiny end-to-end run.
 */
import { describe, expect, it } from 'vitest';
import { BRIEF_SWEEP_DEFAULTS, formatMeans, meansBy, parseBriefSweepArgs, runBriefSweep, type BriefSweepRow } from './brief-sweep';

describe('brief sweep', () => {
  it('parses flags and rejects nonsense', () => {
    expect(parseBriefSweepArgs([])).toEqual(BRIEF_SWEEP_DEFAULTS);
    expect(parseBriefSweepArgs(['--plans', 'demo-6', '--modes', 'freeze,blind', '--seeds', '7,8', '--ticks', '30', '--brains', 'ours'])).toEqual({ plans: ['demo-6'], modes: ['freeze', 'blind'], seeds: [7, 8], ticks: 30, brains: ['ours'] });
    expect(() => parseBriefSweepArgs(['--plans', 'nope'])).toThrow(/unknown plan/);
    expect(() => parseBriefSweepArgs(['--modes', 'bogus'])).toThrow(/--modes/);
    expect(() => parseBriefSweepArgs(['--seeds', 'x'])).toThrow(/--seeds/);
    expect(() => parseBriefSweepArgs(['--ticks', '0'])).toThrow(/--ticks/);
    expect(() => parseBriefSweepArgs(['--plans', ''])).toThrow(/--plans/);
  });

  it('meansBy averages per group and brain, excluding never and counting it', () => {
    const row = (brain: string, seed: number, extinguishedAt: number | null, wrongFloor: number): BriefSweepRow => ({
      plan: 'p', mode: 'freeze', seed, brain,
      fireVolume: 10, peakBurning: 1, containedAt: 1, extinguishedAt, spacesBurnedOut: 1, tetherTicks: 5, retardantSpent: 0.5, droneDeaths: 0, wrongFloor, hedges: 0,
    });
    const rows = [row('ours', 1, 10, 4), row('ours', 2, null, 6), row('kalman', 1, 20, 1), row('kalman', 2, 30, 1)];
    const m = meansBy(rows, (r) => r.plan, ['ours', 'kalman']);
    expect(m.map((x) => x.brain)).toEqual(['ours', 'kalman']);
    expect(m[0]!.extinguishedAt).toEqual({ mean: 10, never: 1 });
    expect(m[0]!.wrongFloor).toEqual({ mean: 5, never: 0 });
    expect(m[1]!.extinguishedAt).toEqual({ mean: 25, never: 0 });
    const text = formatMeans(m);
    expect(text).toContain('10*'); // one never
    expect(text.split('\n')[0]).toContain('extinguishedAt');
  });

  it('runs a tiny sweep end to end: one row per (plan, mode, seed, brain)', () => {
    const rows = runBriefSweep({ plans: ['demo-6'], modes: ['freeze'], seeds: [7], ticks: 20, brains: ['ours', 'kalman'] });
    expect(rows.map((r) => r.brain)).toEqual(['ours', 'kalman']);
    for (const r of rows) {
      expect(r.plan).toBe('demo-6');
      expect(r.fireVolume).toBeGreaterThan(0);
      expect(r.hedges === null || Number.isFinite(r.hedges)).toBe(true);
    }
  });
});
