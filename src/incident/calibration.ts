/**
 * src/incident — shared. The incident replay (docs/10-incident-replay-plan.md): how a
 * documented real fire compares with the simulation, in minutes.
 *
 * This file: the uncontrolled world-only run and the floor milestones read off it, plus
 * the report's milestone windows the plan file was calibrated to. No brain involved.
 */
import { createWorld } from '../world';
import type { StructurePlan } from '../shared/types';

/** Minutes per simulation tick for the incident plans (calibration, step 3). */
export const TICK_MINUTES = 4;

export type FloorMilestones = {
  /** Minute a floor first had a burning space, by floor. */
  firstBurning: Record<number, number>;
  /** Minute every office zone (row A) of the given floor was burning or burned out, or null. */
  fullyInvolved: Record<number, number | null>;
  /** Minute of the last tick with any fire, or null if nothing ever burned. */
  lastFire: number | null;
  /** Space-minutes burning over the run. */
  fireVolumeMinutes: number;
  peakFloors: number;
};

export const floorOf = (id: string): number => Number(/^L(\d+)-/.exec(id)?.[1] ?? NaN);
export const zoneOf = (id: string): string => id.split('-')[1] ?? '';

/** Run the world alone (no commands, no sensors read) and return the milestones. Deterministic for a seed. */
export function runUncontrolled(plan: StructurePlan, minutes: number, seed = 42, tickMinutes = TICK_MINUTES, officeZones: readonly string[] = ['A1', 'A2', 'A3', 'A4']): FloorMilestones {
  const world = createWorld({ plan, seed });
  const ticks = Math.ceil(minutes / tickMinutes);
  const firstBurning: Record<number, number> = {};
  const fullyInvolved: Record<number, number | null> = {};
  const floors = [...new Set(plan.spaces.map((s) => s.level))];
  for (const f of floors) fullyInvolved[f] = null;
  let lastFire: number | null = null;
  let volume = 0;
  let peakFloors = 0;
  for (let t = 1; t <= ticks; t++) {
    const { truth } = world.tick([]);
    const minute = t * tickMinutes;
    const burning = truth.spaces.filter((s) => s.burning);
    volume += burning.length * tickMinutes;
    if (burning.length) lastFire = minute;
    peakFloors = Math.max(peakFloors, new Set(burning.map((s) => s.level)).size);
    for (const s of burning) firstBurning[s.level] ??= minute;
    for (const f of floors) {
      if (fullyInvolved[f] !== null) continue;
      const offices = truth.spaces.filter((s) => s.level === f && officeZones.includes(zoneOf(s.id)));
      if (offices.length > 0 && offices.every((s) => s.burning || s.fuel <= 0)) fullyInvolved[f] = minute;
    }
  }
  return { firstBurning, fullyInvolved, lastFire, fireVolumeMinutes: volume, peakFloors };
}

/**
 * The report's milestones the plan is calibrated against (minutes from detection, TR-049
 * pages in data/incidents/one-meridian-plaza/sources.md). Early ones are windows; later
 * ones are upper bounds because the real fire was being fought from minute ~352 and an
 * uncontrolled run should be no slower than it.
 */
export type MilestoneWindow = { floor: number; kind: 'first' | 'full' | 'never'; lo: number; hi: number; why: string };
export const OMP_MILESTONES: readonly MilestoneWindow[] = [
  { floor: 22, kind: 'full', lo: 0, hi: 45, why: 'fire from several windows on 22 by ~40 min (p. 9)' },
  { floor: 23, kind: 'first', lo: 40, hi: 100, why: '23 and 24 within the hour after the initial attack (p. 10)' },
  { floor: 24, kind: 'first', lo: 60, hi: 150, why: 'same' },
  { floor: 25, kind: 'first', lo: 100, hi: 352, why: 'burning on 24 and 25 at 02:15 (p. 11)' },
  { floor: 26, kind: 'first', lo: 120, hi: 420, why: 'extending to 26 at 02:15 (p. 11)' },
  { floor: 30, kind: 'first', lo: 200, hi: 1118, why: 'reached 30 before 15:01 (p. 12)' },
  { floor: 31, kind: 'never', lo: 0, hi: 0, why: 'fully sprinklered, never burned (p. 7, 12)' },
  { floor: 20, kind: 'never', lo: 0, hi: 0, why: 'the staging floor never burned (p. 9)' },
];

export type MilestoneCheck = { window: MilestoneWindow; value: number | null; ok: boolean };
export function checkMilestones(m: FloorMilestones, windows: readonly MilestoneWindow[] = OMP_MILESTONES): MilestoneCheck[] {
  return windows.map((w) => {
    const value = w.kind === 'full' ? m.fullyInvolved[w.floor] ?? null : m.firstBurning[w.floor] ?? null;
    const ok = w.kind === 'never' ? value === null : value !== null && value >= w.lo && value <= w.hi;
    return { window: w, value, ok };
  });
}
