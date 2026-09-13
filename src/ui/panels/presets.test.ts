import { describe, expect, it } from 'vitest';
import { DEMO_PLAN, runLoop } from '../../loop';
import { loadPlan } from '../../shared/structures';
import { hottestNeighbor, neighborsOf, presetsFor, sensorReadout } from './presets';

describe('neighborsOf', () => {
  it('lists every edge partner once, including vertical ones', () => {
    expect(neighborsOf(DEMO_PLAN, 'S3')).toEqual(['S2', 'S4']);
    const vessel = loadPlan('vessel-3x8');
    const n = neighborsOf(vessel, 'L1-A1');
    expect(n).toContain('L2-A1'); // floor + shaft edges, listed once
    expect(new Set(n).size).toBe(n.length);
  });
});

describe('hottestNeighbor', () => {
  /** A hand-built trace where the SECOND neighbour (S4) is the hot one at tick `onset` only. */
  function tracePeakingAt(onset: number, ticks: number) {
    const base = runLoop({ plan: DEMO_PLAN, seed: 1, ticks });
    return base.map((rec, i) => ({
      ...rec,
      obs: { ...rec.obs, readings: rec.obs.readings.map((r) => ({ ...r, temp: r.spaceId === 'S4' && i === onset - 1 ? 900 : r.spaceId === 'S4' ? 0 : r.spaceId === 'S2' ? 100 : r.temp })) },
    }));
  }

  it('uses the first neighbour when there is no trace, and the hottest OBSERVED one at trace[onset-1] when there is', () => {
    expect(hottestNeighbor(DEMO_PLAN, 'S3', null, 5)).toBe('S2');
    const trace = tracePeakingAt(10, 20);
    expect(hottestNeighbor(DEMO_PLAN, 'S3', trace, 10)).toBe('S4'); // hot at the onset tick
    expect(hottestNeighbor(DEMO_PLAN, 'S3', trace, 11)).toBe('S2'); // one tick later S4 reads 0
    expect(hottestNeighbor(DEMO_PLAN, 'S3', trace, 9)).toBe('S2');
  });

  it('is undefined for an isolated space and clamps onset to the trace', () => {
    const lone = { ...DEMO_PLAN, spaces: [...DEMO_PLAN.spaces, { id: 'X', level: 1 }] };
    expect(hottestNeighbor(lone, 'X', null, 5)).toBeUndefined();
    const trace = tracePeakingAt(3, 3); // S4 hot on the last tick
    expect(hottestNeighbor(DEMO_PLAN, 'S3', trace, 999)).toBe('S4');
    expect(hottestNeighbor(DEMO_PLAN, 'S3', trace, -5)).toBe('S2');
  });
});

describe('presetsFor', () => {
  it('builds the four presets from the plan and keeps onset and thresholds', () => {
    const p = presetsFor(DEMO_PLAN, 'S3', null, { mode: 'none', onset: 7, flashoverTemp: 450 });
    expect(p.map((x) => x.id)).toEqual(['freeze-ignition', 'blind-neighbor', 'flashover', 'everything']);
    expect(p[0]!.corruption).toEqual({ mode: 'freeze', k: 1, onset: 7, flashoverTemp: 450, target: ['S3'] });
    expect(p[1]!.corruption).toEqual({ mode: 'blind', k: 1, onset: 7, flashoverTemp: 450, target: ['S2'] });
    expect(p[2]!.corruption).toEqual({ mode: 'flashover', k: 1, onset: 7, flashoverTemp: 450 });
    expect(p[3]!.corruption).toEqual({ mode: 'mixed', k: 3, onset: 7, flashoverTemp: 450 });
    // An empty target would mean "no sensor" to the corruptor; presets never emit one.
    for (const x of p) expect(x.corruption.target === undefined || x.corruption.target.length > 0).toBe(true);
  });

  it('flashover and everything actually corrupt something when run', () => {
    const p = presetsFor(DEMO_PLAN, 'S3', null, { mode: 'none', onset: 3, flashoverTemp: 300 });
    const clean = runLoop({ plan: DEMO_PLAN, seed: 1, ticks: 40 });
    for (const id of ['flashover', 'everything']) {
      const c = p.find((x) => x.id === id)!.corruption;
      const t = runLoop({ plan: DEMO_PLAN, seed: 1, ticks: 40, corruption: c });
      const differs = t.some((rec, i) => JSON.stringify(rec.obs.readings) !== JSON.stringify(clean[i]!.obs.readings));
      expect(differs, id).toBe(true);
    }
  });

  it('blind falls back to any sensor when the ignition space has no neighbour', () => {
    const lone = { ...DEMO_PLAN, spaces: [...DEMO_PLAN.spaces, { id: 'X', level: 1 }] };
    const p = presetsFor(lone, 'X', null, { mode: 'none' });
    expect(p[1]!.corruption).toEqual({ mode: 'blind', k: 1, onset: 5 });
  });
});

describe('sensorReadout', () => {
  it('counts present fixed readings against the plan and lists the missing ids, from obs only', () => {
    const trace = runLoop({ plan: DEMO_PLAN, seed: 1, ticks: 30, corruption: { mode: 'flashover', onset: 3, flashoverTemp: 300 } });
    const last = trace[29]!;
    const r = sensorReadout(DEMO_PLAN, last.obs);
    expect(r.total).toBe(6);
    expect(r.present + r.missing.length).toBe(6);
    expect(r.missing.length).toBeGreaterThan(0); // flashover killed at least S3's sensor
    expect(r.missing).toContain('F3');
    expect(sensorReadout(DEMO_PLAN, undefined)).toEqual({ present: 0, total: 6, missing: ['F1', 'F2', 'F3', 'F4', 'F5', 'F6'] });
    const clean = runLoop({ plan: DEMO_PLAN, seed: 1, ticks: 5 });
    expect(sensorReadout(DEMO_PLAN, clean[4]!.obs)).toEqual({ present: 6, total: 6, missing: [] });
  });
});
