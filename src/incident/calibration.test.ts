import { describe, expect, it } from 'vitest';
import { loadPlan } from '../shared/structures';
import { checkMilestones, floorOf, OMP_MILESTONES, runUncontrolled, TICK_MINUTES, zoneOf } from './calibration';

describe('incident calibration (uncontrolled run of the highrise plan at 4 min/tick)', () => {
  const plan = loadPlan('highrise-12x9');
  const m = runUncontrolled(plan, 1240);

  it('meets every milestone window the plan was calibrated to', () => {
    const checks = checkMilestones(m);
    const failed = checks.filter((c) => !c.ok).map((c) => `${c.window.kind} F${c.window.floor}=${c.value} not in [${c.window.lo},${c.window.hi}] (${c.window.why})`);
    expect(failed, failed.join('\n')).toEqual([]);
    expect(checks).toHaveLength(OMP_MILESTONES.length);
  });

  it('climbs floor by floor and burns out before the real fire was declared under control', () => {
    for (let f = 23; f <= 29; f++) expect(m.firstBurning[f]!, `F${f} after F${f - 1}`).toBeGreaterThan(m.firstBurning[f - 1]!);
    expect(m.lastFire).not.toBeNull();
    expect(m.lastFire!).toBeLessThan(1118);
    expect(m.peakFloors).toBeGreaterThanOrEqual(4);
    expect(m.peakBurning).toBeGreaterThanOrEqual(m.peakFloors); // at least one space per burning floor
    expect(m.peakBurning).toBeLessThanOrEqual(plan.spaces.length);
    expect(m.fireVolumeMinutes).toBeGreaterThan(0);
  });

  it('is deterministic for a seed and different for another', () => {
    const again = runUncontrolled(plan, 1240);
    expect(again).toEqual(m);
    expect(runUncontrolled(plan, 1240, 7).firstBurning).not.toEqual(m.firstBurning);
  });

  it('helpers and the tick constant', () => {
    expect(TICK_MINUTES).toBe(4);
    expect(floorOf('L22-A3')).toBe(22);
    expect(zoneOf('L22-A3')).toBe('A3');
    expect(Number.isNaN(floorOf('S3'))).toBe(true);
    const short = runUncontrolled(plan, 8);
    expect(short.firstBurning[22]).toBe(4);
    expect(short.lastFire).toBe(8);
  });
});
