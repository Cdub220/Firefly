/**
 * src/eval — owned by Dean.
 *
 * Model-mismatch probe. "Physics as a trusted reference" is true by construction when the
 * brain's heat model and the world's share the plan's edge rates. This hands every brain a
 * PERTURBED plan (each edge rate scaled by a seeded factor in [1 - scale, 1 + scale]) while
 * the world keeps the true one, and prints the metrics next to the exact-model run. Freeze-
 * legal: a config change, not a brain change, so it doubles as a post-freeze held-out family.
 *
 *   npm run probe:mismatch                 scale 0.3, seed 1, demo-6 + vessel-3x8
 *   npm run probe:mismatch -- --scale 0.5 --seed 3 --plans demo-6,vessel-3x8,tower-5x4
 */
import { runLoopMulti } from '../loop';
import { createBrain } from '../brain';
import { createGatedKalmanBrain, createKalmanBrain, createSourceKalmanBrain } from '../brain/kalman';
import { computeMetrics } from './metrics';
import { makeRng } from '../shared/rng';
import { loadPlan } from '../shared/structures';
import type { BrainConfig, CorruptionConfig, CorruptionMode, StructurePlan } from '../shared/types';

export function perturbPlan(plan: StructurePlan, scale: number, seed: number): StructurePlan {
  const rng = makeRng(seed).fork('mismatch');
  return {
    ...plan,
    edges: plan.edges.map((e) => ({ ...e, rate: e.rate * (1 + scale * rng.range(-1, 1)) })),
  };
}

const get = (flag: string): string | undefined => {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const scale = Number(get('--scale') ?? 0.3);
const seed = Number(get('--seed') ?? 1);
const plans = (get('--plans') ?? 'demo-6,vessel-3x8').split(',');
const modes: CorruptionMode[] = ['none', 'freeze', 'blind', 'flashover'];
const ONSET = 5;
const TICKS = 80;

const pct = (x: number): string => `${(100 * x).toFixed(0)}%`;
console.log(`mismatch probe  scale=±${scale}  seed=${seed}  ticks=${TICKS}  onset=${ONSET}  brains see perturbed edge rates, the world keeps the true ones`);
console.log(`\n  ${'plan'.padEnd(12)}${'mode'.padEnd(10)}${'brain'.padEnd(20)}${'falseCert'.padStart(10)}${'fc@P.9'.padStart(8)}${'coverage'.padStart(9)}${'wrongDisp'.padStart(10)}${'err C'.padStart(8)}${'brier'.padStart(7)}`);
for (const planName of plans) {
  const plan = loadPlan(planName);
  const wrong = perturbPlan(plan, scale, seed);
  const withPlan = (factory: (c: BrainConfig) => ReturnType<typeof createBrain>, p: StructurePlan) => (c: BrainConfig) => factory({ ...c, plan: p });
  for (const mode of modes) {
    const target = plan.ignition[0] ?? plan.spaces[0]!.id;
    const corruption: Omit<CorruptionConfig, 'seed'> = mode === 'none' ? { mode } : { mode, k: 1, onset: ONSET, target: [target], ambient: plan.ambient };
    const traces = runLoopMulti({
      plan, seed, ticks: TICKS, corruption, primary: 'ours-exact',
      brains: {
        'ours-exact': createBrain,
        'ours-mismatch': withPlan(createBrain, wrong),
        'kalman-mismatch': withPlan(createKalmanBrain, wrong),
        'gated-mismatch': withPlan(createGatedKalmanBrain, wrong),
        'source-mismatch': withPlan(createSourceKalmanBrain, wrong),
      },
    });
    for (const [name, trace] of Object.entries(traces)) {
      const m = computeMetrics(trace, { onset: mode === 'none' ? 0 : ONSET });
      console.log(`  ${planName.padEnd(12)}${mode.padEnd(10)}${name.padEnd(20)}${pct(m.falseCertainty).padStart(10)}${pct(m.falseCertaintyByP['0.9'] ?? 0).padStart(8)}${pct(m.ambiguityCoverage).padStart(9)}${pct(m.wrongDispatch).padStart(10)}${m.estimationError.toFixed(1).padStart(8)}${m.brierScore.toFixed(3).padStart(7)}`);
    }
    console.log('');
  }
}
