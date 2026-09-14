import { describe, expect, it } from 'vitest';
import { loadPlan, PLAN_NAMES } from '../shared/structures';
import { defaultMaxLevel, ignitionLevel, levelsOf } from './levels';

describe('level slicer default', () => {
  it('shows the ignition level on every plan file, with any ignition space', () => {
    for (const name of PLAN_NAMES) {
      const plan = loadPlan(name);
      const d = defaultMaxLevel(plan);
      expect(d).toBe(levelsOf(plan)[levelsOf(plan).length - 1]);
      expect(d).toBeGreaterThanOrEqual(ignitionLevel(plan)!);
      for (const s of plan.spaces) expect(defaultMaxLevel(plan, s.id)).toBeGreaterThanOrEqual(s.level);
    }
  });

  it('stacks the tower: five levels, ignition on the second, default shows all five', () => {
    const tower = loadPlan('tower-5x4');
    expect(levelsOf(tower)).toEqual([1, 2, 3, 4, 5]);
    expect(ignitionLevel(tower)).toBe(2);
    expect(defaultMaxLevel(tower)).toBe(5);
  });

  it('tolerates an unknown ignition and an empty plan', () => {
    const plan = { spaces: [{ id: 'a', level: 3 }, { id: 'b', level: 1 }], ignition: ['zzz'] } as unknown as Parameters<typeof defaultMaxLevel>[0];
    expect(ignitionLevel(plan)).toBeUndefined();
    expect(defaultMaxLevel(plan)).toBe(3);
    expect(defaultMaxLevel({ spaces: [], ignition: [] })).toBe(1);
  });
});
