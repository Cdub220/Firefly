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
  it('uses the first neighbour when there is no trace, and the hottest observed one when there is', () => {
    expect(hottestNeighbor(DEMO_PLAN, 'S3', null, 5)).toBe('S2');
    const trace = runLoop({ plan: DEMO_PLAN, seed: 1, ticks: 20 });
    const hot = hottestNeighbor(DEMO_PLAN, 'S3', trace, 10)!;
    const rec = trace[9]!;
    const temps = Object.fromEntries(rec.obs.readings.filter((r) => r.source === 'fixed').map((r) => [r.spaceId, r.temp]));
    expect(['S2', 'S4']).toContain(hot);
    expect(temps[hot]).toBe(Math.max(temps['S2']!, temps['S4']!));
  });

  it('is undefined for an isolated space and clamps onset to the trace', () => {
    const lone = { ...DEMO_PLAN, spaces: [...DEMO_PLAN.spaces, { id: 'X', level: 1 }] };
    expect(hottestNeighbor(lone, 'X', null, 5)).toBeUndefined();
    const trace = runLoop({ plan: DEMO_PLAN, seed: 1, ticks: 3 });
    expect(['S2', 'S4']).toContain(hottestNeighbor(DEMO_PLAN, 'S3', trace, 999));
  });
});

describe('presetsFor', () => {
  it('builds the four presets from the plan and keeps onset and thresholds', () => {
    const p = presetsFor(DEMO_PLAN, 'S3', null, { mode: 'none', onset: 7, flashoverTemp: 450 });
    expect(p.map((x) => x.id)).toEqual(['freeze-ignition', 'blind-neighbor', 'flashover', 'everything']);
    expect(p[0]!.corruption).toEqual({ mode: 'freeze', k: 1, onset: 7, flashoverTemp: 450, target: ['S3'] });
    expect(p[1]!.corruption).toEqual({ mode: 'blind', k: 1, onset: 7, flashoverTemp: 450, target: ['S2'] });
    expect(p[2]!.corruption.mode).toBe('flashover');
    expect(p[3]!.corruption).toMatchObject({ mode: 'mixed', k: 3, target: [] });
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
