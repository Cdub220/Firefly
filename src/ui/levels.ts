/**
 * The level slicer ("show levels ≤ N") default. Pure, so the rule is testable: the top
 * level, which shows every level and therefore always the ignition level. Views reset to
 * it when the plan changes. (A default that hid the upper floors would undercut the
 * "different building" beat, whose point is five levels on screen; see decisions.md.)
 */
import type { StructurePlan } from '../shared/types';

export function levelsOf(plan: Pick<StructurePlan, 'spaces'>): number[] {
  return [...new Set(plan.spaces.map((s) => s.level))].sort((a, b) => a - b);
}

export function ignitionLevel(plan: Pick<StructurePlan, 'spaces' | 'ignition'>, ignition?: string): number | undefined {
  const id = ignition ?? plan.ignition[0];
  return plan.spaces.find((s) => s.id === id)?.level;
}

/** The slicer default: the top level (1 for a plan with no spaces). */
export function defaultMaxLevel(plan: Pick<StructurePlan, 'spaces'>): number {
  const levels = levelsOf(plan);
  return levels[levels.length - 1] ?? 1;
}
