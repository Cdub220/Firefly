/**
 * Headless eval harness. Runs under tsx: `npx tsx src/eval/index.ts --seed 42 --ticks 200`.
 * TODO(Dean): sweep corruption location, correlation structure, k; run Kalman baseline on
 * identical seeds; emit a table.
 */
import { DEMO_PLAN, runLoop } from '../loop';
import { computeMetrics } from './metrics';

export { computeMetrics } from './metrics';
export type { Metrics } from './metrics';

const isMain = process.argv[1] !== undefined && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) {
  const argv = process.argv.slice(2);
  const num = (flag: string, d: number): number => {
    const i = argv.indexOf(flag);
    const v = i >= 0 ? Number(argv[i + 1]) : NaN;
    return Number.isFinite(v) ? v : d;
  };
  const seed = num('--seed', 42);
  const ticks = num('--ticks', 200);
  const trace = runLoop({ plan: DEMO_PLAN, seed, ticks });
  console.log(JSON.stringify({ plan: DEMO_PLAN.name, seed, ticks, ...computeMetrics(trace) }, null, 2));
}
