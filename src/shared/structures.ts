/**
 * Every plan file this repo ships, loadable by name. Imports are static because Vite
 * needs them to be; adding a plan means adding a line here (and, if generated, a spec in
 * src/world/gen.ts).
 */
import type { StructurePlan } from './types';
import demo6 from '../../data/structures/demo-6.json';
import vessel3x8 from '../../data/structures/vessel-3x8.json';
import tower5x4 from '../../data/structures/tower-5x4.json';

const PLANS = {
  'demo-6': demo6 as StructurePlan,
  'vessel-3x8': vessel3x8 as StructurePlan,
  'tower-5x4': tower5x4 as StructurePlan,
} as const;

export type PlanName = keyof typeof PLANS;

export const PLAN_NAMES: readonly PlanName[] = Object.keys(PLANS) as PlanName[];

export function isPlanName(name: string): name is PlanName {
  return name in PLANS;
}

/** Throws on an unknown name so a typo in a CLI flag fails loudly. */
export function loadPlan(name: string): StructurePlan {
  if (!isPlanName(name)) throw new Error(`unknown plan "${name}"; expected one of ${PLAN_NAMES.join(', ')}`);
  return PLANS[name];
}
