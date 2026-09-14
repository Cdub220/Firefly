import { describe, expect, it } from 'vitest';
import { loadPlan, PLAN_NAMES } from '../shared/structures';
import { defaultMaxLevel, ignitionLevel, levelsOf } from './levels';

describe('level slicer default', () => {
  it('is the top level on every plan file, so the ignition level (any space) is always shown', () => {
    for (const name of PLAN_NAMES) {
      const plan = loadPlan(name);
      const levels = levelsOf(plan);
      expect(defaultMaxLevel(plan)).toBe(levels[levels.length - 1]);
      for (const s of plan.spaces) expect(defaultMaxLevel(plan), `${name} ${s.id}`).toBeGreaterThanOrEqual(ignitionLevel(plan, s.id)!);
    }
  });

  it('stacks the tower: five levels, ignition on the second, default shows all five', () => {
    const tower = loadPlan('tower-5x4');
    expect(levelsOf(tower)).toEqual([1, 2, 3, 4, 5]);
    expect(ignitionLevel(tower)).toBe(2);
    expect(defaultMaxLevel(tower)).toBe(5);
    expect(defaultMaxLevel(loadPlan('demo-6'))).toBe(1);
    expect(defaultMaxLevel(loadPlan('vessel-3x8'))).toBe(3);
  });

  it('tolerates an unknown ignition, unsorted levels and an empty plan', () => {
    const plan = { spaces: [{ id: 'a', level: 3 }, { id: 'b', level: 1 }], ignition: ['zzz'] } as unknown as Parameters<typeof ignitionLevel>[0];
    expect(ignitionLevel(plan)).toBeUndefined();
    expect(levelsOf(plan)).toEqual([1, 3]);
    expect(defaultMaxLevel(plan)).toBe(3);
    expect(defaultMaxLevel({ spaces: [] })).toBe(1);
  });
});
