/**
 * The level slicer ("show levels ≤ N") default. Pure, so the rule is testable: every
 * level is shown, which always includes the ignition level; a plan whose ignition space
 * is unknown or off-grid still gets its top level. Views reset to this when the plan
 * changes.
 */
import type { StructurePlan } from '../shared/types';

export function levelsOf(plan: Pick<StructurePlan, 'spaces'>): number[] {
  return [...new Set(plan.spaces.map((s) => s.level))].sort((a, b) => a - b);
}

export function ignitionLevel(plan: Pick<StructurePlan, 'spaces' | 'ignition'>, ignition?: string): number | undefined {
  const id = ignition ?? plan.ignition[0];
  return plan.spaces.find((s) => s.id === id)?.level;
}

/** The slicer default: the top level, and never below the ignition level. */
export function defaultMaxLevel(plan: Pick<StructurePlan, 'spaces' | 'ignition'>, ignition?: string): number {
  const levels = levelsOf(plan);
  const top = levels[levels.length - 1] ?? 1;
  return Math.max(top, ignitionLevel(plan, ignition) ?? top);
}
