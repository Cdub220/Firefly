/**
 * Every plan file this repo ships, loadable by name. Imports are static because Vite
 * needs them to be; adding a plan means adding a line here (and, if generated, a spec in
 * src/world/gen.ts).
 */
import type { StructurePlan } from './types';
import demo6 from '../../data/structures/demo-6.json';
import vessel3x8 from '../../data/structures/vessel-3x8.json';
import tower5x4 from '../../data/structures/tower-5x4.json';
// Incident replays (docs/10-incident-replay-plan.md): generated from a spec by src/world/gen-highrise.ts.
import highrise12x9 from '../../data/incidents/one-meridian-plaza/plan.json';
import highrise12x9Instrumented from '../../data/incidents/one-meridian-plaza/plan.instrumented.json';

/** The evaluation family: the sweep, the evidence table, the hedge script and the demo script cycle over these. */
const PLANS = {
  'demo-6': demo6 as StructurePlan,
  'vessel-3x8': vessel3x8 as StructurePlan,
  'tower-5x4': tower5x4 as StructurePlan,
} as const;

/**
 * Incident replays: loadable by name and shown in the plan picker, but NOT in PLAN_NAMES,
 * so the frozen evaluation family (sweep defaults, `npm run hedge`'s "largest plan", the
 * per-plan tests) does not change when one is added. 108-space plans would also make
 * the sweep grid several times slower.
 */
const INCIDENT_PLANS = {
  'highrise-12x9': highrise12x9 as StructurePlan,
  'highrise-12x9-instrumented': highrise12x9Instrumented as StructurePlan,
} as const;

export type PlanName = keyof typeof PLANS | keyof typeof INCIDENT_PLANS;

export const PLAN_NAMES: readonly PlanName[] = Object.keys(PLANS) as PlanName[];
export const INCIDENT_PLAN_NAMES: readonly PlanName[] = Object.keys(INCIDENT_PLANS) as PlanName[];
/** Every plan the picker and the CLI accept. */
export const ALL_PLAN_NAMES: readonly PlanName[] = [...PLAN_NAMES, ...INCIDENT_PLAN_NAMES];

export function isPlanName(name: string): name is PlanName {
  return Object.hasOwn(PLANS, name) || Object.hasOwn(INCIDENT_PLANS, name);
}

/** Throws on an unknown name so a typo in a CLI flag fails loudly. */
export function loadPlan(name: string): StructurePlan {
  if (!isPlanName(name)) throw new Error(`unknown plan "${name}"; expected one of ${ALL_PLAN_NAMES.join(', ')}`);
  return Object.hasOwn(PLANS, name) ? PLANS[name as keyof typeof PLANS] : INCIDENT_PLANS[name as keyof typeof INCIDENT_PLANS];
}
