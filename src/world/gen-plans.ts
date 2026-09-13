/**
 * `npm run gen:plans`: regenerate every generated plan file in data/structures from
 * PLAN_SPECS. Deterministic; the test in plans.test.ts fails if a committed file drifts
 * from what the generator produces. Hand-edit nothing.
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { validatePlan } from '../shared/plan';
import { makeGridPlan, PLAN_SPECS } from './gen';

/** Serialised form of a plan file: 2-space JSON with a trailing newline. */
export function planFileText(spec: (typeof PLAN_SPECS)[string]): string {
  const plan = makeGridPlan(spec);
  validatePlan(plan);
  return `${JSON.stringify(plan, null, 2)}\n`;
}

export const STRUCTURES_DIR = resolve(process.cwd(), 'data/structures');

const isMain =
  typeof process !== 'undefined' &&
  process.argv?.[1] !== undefined &&
  import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) {
  for (const [name, spec] of Object.entries(PLAN_SPECS)) {
    const path = resolve(STRUCTURES_DIR, `${name}.json`);
    writeFileSync(path, planFileText(spec));
    const plan = makeGridPlan(spec);
    console.log(`wrote ${path}  spaces=${plan.spaces.length} edges=${plan.edges.length} sensors=${plan.sensors.length}`);
  }
}
