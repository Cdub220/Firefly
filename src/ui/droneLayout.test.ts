import { describe, expect, it } from 'vitest';
import { DEMO_PLAN, runLoop } from '../loop';
import { loadPlan } from '../shared/structures';
import type { Drone } from '../shared/types';
import { droneRows, nearestResupply, ringOffsets, slotsBySpace, taskColor } from './droneLayout';

describe('ringOffsets', () => {
  it('gives n distinct positions, deterministic, on a ring of the given radius', () => {
    for (const n of [1, 2, 3, 6, 12]) {
      const a = ringOffsets(n);
      const b = ringOffsets(n);
      expect(a).toEqual(b);
      expect(a).toHaveLength(n);
      const keys = new Set(a.map((p) => `${p.dx},${p.dz}`));
      expect(keys.size).toBe(n);
      if (n > 1) for (const p of a) expect(Math.hypot(p.dx, p.dz)).toBeCloseTo(0.62, 2);
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) expect(Math.hypot(a[i]!.dx - a[j]!.dx, a[i]!.dz - a[j]!.dz)).toBeGreaterThan(0.2);
    }
    expect(ringOffsets(1)).toEqual([{ dx: 0, dz: 0 }]);
    expect(ringOffsets(0)).toEqual([]);
    expect(ringOffsets(4, 2)[0]).toEqual({ dx: 2, dz: 0 });
  });
});

describe('slotsBySpace', () => {
  it('numbers drones within a space by id and keeps counts per space', () => {
    const ds: Pick<Drone, 'id' | 'at' | 'alive'>[] = [
      { id: 'D3', at: 'S1', alive: true }, { id: 'D1', at: 'S1', alive: true }, { id: 'D2', at: 'S4', alive: false },
    ];
    const s = slotsBySpace(ds);
    expect(s.get('D1')).toEqual({ index: 0, count: 2 });
    expect(s.get('D3')).toEqual({ index: 1, count: 2 });
    expect(s.get('D2')).toEqual({ index: 0, count: 1 });
  });
});

describe('nearestResupply', () => {
  it('returns the space itself when it is a resupply, else the nearest by hops', () => {
    expect(nearestResupply(DEMO_PLAN, 'S1')).toBe('S1');
    expect(nearestResupply(DEMO_PLAN, 'S4')).toBe('S1');
    const vessel = loadPlan('vessel-3x8');
    expect(nearestResupply(vessel, 'L3-B4')).toBe('L1-A1');
    expect(nearestResupply({ ...DEMO_PLAN, resupply: [] }, 'S3')).toBeUndefined();
    const two = { ...DEMO_PLAN, resupply: ['S1', 'S5'] };
    expect(nearestResupply(two, 'S5')).toBe('S5'); // standing on a resupply that is not resupply[0]
    expect(nearestResupply(two, 'S4')).toBe('S5'); // S4-S5 is one hop; S1 is three
    expect(['S1', 'S5']).toContain(nearestResupply(two, 'S6')); // both one hop: either is fine
  });
});

describe('droneRows', () => {
  it('joins truth, the brain self-reports, and commands; flags stale reports and arrivals', () => {
    const trace = runLoop({ plan: DEMO_PLAN, seed: 1, ticks: 3 });
    const rec = trace[2]!;
    const rows = droneRows(rec);
    expect(rows.map((r) => r.id)).toEqual(rec.truth.drones.map((d) => d.id));
    for (const r of rows) {
      expect(r.stale).toBe(false); // clean run: self-reports match truth
      expect(r.seenAt).toBe(r.at);
      expect(r.arrived).toBe(false); // no command, so nothing to arrive at
      expect(r.goTo).toBeUndefined();
    }
    // Stale: the brain saw D1 somewhere else.
    const staleRec = { ...rec, obs: { ...rec.obs, drones: rec.obs.drones.map((d) => (d.id === 'D1' ? { ...d, at: 'S6' } : d)) } };
    expect(droneRows(staleRec).find((r) => r.id === 'D1')!.stale).toBe(true);
    expect(droneRows(staleRec).find((r) => r.id === 'D1')!.seenAt).toBe('S6');
    // Missing self-report is stale too; a dead drone is never stale.
    const missing = { ...rec, obs: { ...rec.obs, drones: rec.obs.drones.filter((d) => d.id !== 'D2') } };
    expect(droneRows(missing).find((r) => r.id === 'D2')!.stale).toBe(true);
    const dead = { ...missing, truth: { ...rec.truth, drones: rec.truth.drones.map((d) => (d.id === 'D2' ? { ...d, alive: false } : d)) } };
    expect(droneRows(dead).find((r) => r.id === 'D2')!.stale).toBe(false);
    // Commands: goTo/task carried, arrived when at === goTo, last command per drone wins.
    const withCmd = { ...rec, commands: [{ droneId: 'D1', goTo: 'S4', task: 'observe' }, { droneId: 'D1', goTo: 'S1', task: 'hold' }] };
    const d1 = droneRows(withCmd).find((r) => r.id === 'D1')!;
    expect(d1.goTo).toBe('S1');
    expect(d1.task).toBe('hold');
    expect(d1.arrived).toBe(d1.at === 'S1');
  });
});

describe('taskColor', () => {
  it('has a colour per known task and a fallback', () => {
    for (const t of ['suppress', 'coat', 'observe', 'close-door', 'refill', 'hold']) expect(taskColor(t)).toMatch(/^#/);
    expect(taskColor('dance')).toMatch(/^#/);
    expect(new Set(['suppress', 'coat', 'observe', 'close-door', 'refill', 'hold'].map(taskColor)).size).toBe(6);
  });
});
